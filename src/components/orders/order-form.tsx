"use client"

import { useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { useQueryClient } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Plus } from "lucide-react"

import { useRouter } from "@/i18n/navigation"
import {
  orderFormSchema,
  orderStatusValues,
  type OrderFormValues,
  type OrderItemValues,
} from "@/lib/validations/order"
import type { OrderWithItems } from "@/db/queries/orders"
import type { ProductType } from "@/db/queries/product-types"
import type { OrderStatusLabel } from "@/db/queries/settings"
import { DEFAULT_ADMIN_STATUS_LABELS } from "@/lib/order-status"
import { createOrder, updateOrder } from "@/app/[locale]/admin/orders/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SimpleSelect } from "@/components/ui/simple-select"
import { OrderLineRow } from "@/components/orders/order-line-row"
import { OrderSummary } from "@/components/orders/order-summary"
import { Field } from "@/components/orders/order-field"

/** Rewritten as a full-page multi-line builder rather than carstockpro's
 * `sell-dialog.tsx` (a single-car dialog) — an order here can carry several
 * product lines, and shipping/packing are charged once per order, not per
 * line. See plan §11/§12 and the phase report for the fuller comparison. */

const BLANK_ITEM: OrderItemValues = {
  productId: "",
  productCode: "",
  productName: "",
  productType: "",
  color: "",
  size: "",
  productCost: 0,
  sellPrice: 0,
  preorderMinDays: null,
  preorderMaxDays: null,
  quantity: 1,
  statusCode: "not_ordered",
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function OrderForm({
  order,
  types,
  statusLabels = [],
  locale = "th",
}: {
  order?: OrderWithItems
  types: ProductType[]
  statusLabels?: OrderStatusLabel[]
  locale?: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const isEdit = !!order
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      orderDate: order?.orderDate ?? todayIso(),
      customerName: order?.customerName ?? "",
      customerPhone: order?.customerPhone ?? "",
      customerAddress: order?.customerAddress ?? "",
      shippingCost: order ? Number(order.shippingCost) : 0,
      packingCost: order ? Number(order.packingCost) : 0,
      advertisingCost: order ? Number(order.advertisingCost) : 0,
      status: order?.status ?? "new",
      shippingConfirmed: !!order?.shippingConfirmedAt,
      refundReason: order?.refundReason ?? "",
      note: order?.note ?? "",
      items:
        order && order.items.length > 0
          ? order.items.map((item) => ({
              id: item.id,
              productId: item.productId ?? "",
              productVariantId: item.productVariantId ?? "",
              productCode: item.productCode,
              productName: item.productName,
              productType: item.productType ?? "",
              color: item.color ?? "",
              size: item.size ?? "",
              productCost: Number(item.productCost),
              sellPrice: Number(item.sellPrice),
              preorderMinDays: item.preorderMinDays,
              preorderMaxDays: item.preorderMaxDays,
              quantity: item.quantity,
              statusCode: item.statusCode,
            }))
          : [BLANK_ITEM],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({ control, name: "items" })

  const typeOptions = types.map((pt) => pt.name)
  const statusLabel = (status: (typeof orderStatusValues)[number]) => {
    const row = statusLabels.find((item) => item.status === status)
    return locale === "en" ? (row?.labelEn ?? DEFAULT_ADMIN_STATUS_LABELS[status].en) : (row?.labelTh ?? DEFAULT_ADMIN_STATUS_LABELS[status].th)
  }
  const selectedStatus = watch("status") ?? "new"
  const items = watch("items") ?? []
  const shippingCost = watch("shippingCost")
  const packingCost = watch("packingCost")
  const advertisingCost = watch("advertisingCost")

  function addLine() {
    append(BLANK_ITEM)
  }

  function removeLine(index: number) {
    if (fields.length <= 1) {
      replace([BLANK_ITEM])
      return
    }
    remove(index)
  }

  async function onSubmit(values: OrderFormValues) {
    setSubmitting(true)
    try {
      const result = isEdit ? await updateOrder(order!.id, values) : await createOrder(values)

      if (!result.ok) {
        toast.error(errorMessage(result.error))
        return
      }

      toast.success(isEdit ? t("order.updated") : t("order.created"))

      /**
       * `router.refresh()` alone is NOT enough to un-stale the order list.
       * `/admin/orders` renders `OrderList`, a client component whose rows
       * come from TanStack Query (`["admin-orders", ...]`) against
       * `/api/admin/orders` — not from the RSC payload. `router.refresh()`
       * re-renders server components, and the server action's
       * `revalidateOrders()` busts Next's *server* cache, but neither
       * touches the *client* query cache. With `staleTime: 30_000`
       * (src/components/providers.tsx) a save followed by navigating back
       * to the list within 30s re-showed the pre-edit totals — the money
       * columns (itemsTotal/profit) looked like the edit had silently
       * failed. Invalidate explicitly so the list refetches on mount.
       *
       * Prefix-matched: every `["admin-orders", search, status, ...]` key
       * is dropped, not just the one page/filter combination last viewed.
       */
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
      router.push(`/admin/orders/${result.id}`)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  function errorMessage(code: string): string {
    if (code === "forbidden") return t("errors.forbidden")
    if (code === "unauthorized") return t("errors.unauthorized")
    if (code === "invalid") return t("errors.invalid")
    if (code === "not_found") return t("errors.notFound")
    if (code === "items_pending") return t("order.itemsPending")
    if (code === "reason_required") return t("order.refundReasonRequired")
    return t("errors.generic")
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Order info */}
      <section className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-3">
        <p className="text-body font-bold text-foreground sm:col-span-3">{t("order.orderInfo")}</p>
        <Field label={t("order.orderDate")} required error={errors.orderDate && t("common.required")}>
          <Input type="date" {...register("orderDate")} />
        </Field>
        <Field label={t("order.status")}>
          <SimpleSelect
            value={selectedStatus}
            onValueChange={(v) =>
              setValue("status", v as OrderFormValues["status"], { shouldValidate: true })
            }
            options={orderStatusValues.map((s) => ({
              value: s,
              label: statusLabel(s),
            }))}
          />
        </Field>
        <Field label={t("order.shippingCost")}>
          <Input type="number" inputMode="decimal" step="0.01" min={0} {...register("shippingCost")} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 self-end pb-2 text-body">
          <input type="checkbox" className="size-5" {...register("shippingConfirmed")} />
          {t("order.shippingConfirmed")}
        </label>
        <Field label={t("order.packingCost")}>
          <Input type="number" inputMode="decimal" step="0.01" min={0} {...register("packingCost")} />
        </Field>
        <Field label={t("order.advertisingCost")}>
          <Input type="number" inputMode="decimal" step="0.01" min={0} {...register("advertisingCost")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("order.note")}>
            <Textarea rows={2} {...register("note")} />
          </Field>
        </div>
        {selectedStatus === "refund" && (
          <div className="sm:col-span-3">
            <Field label={t("order.refundReason")} required error={errors.refundReason && t("common.required")}>
              <Textarea rows={2} {...register("refundReason")} />
            </Field>
          </div>
        )}
      </section>

      {/* Customer */}
      <section className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-2">
        <p className="text-body font-bold text-foreground sm:col-span-2">{t("order.customerInfo")}</p>
        <Field
          label={t("order.customerName")}
          required
          error={errors.customerName && t("common.required")}
        >
          <Input {...register("customerName")} />
        </Field>
        <Field label={t("order.customerPhone")}>
          <Input type="tel" {...register("customerPhone")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("order.customerAddress")}>
            <Textarea rows={2} {...register("customerAddress")} />
          </Field>
        </div>
      </section>

      {/* Line items */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-body font-bold text-foreground">{t("order.lineItems")}</p>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="size-3.5" />
            {t("order.addLine")}
          </Button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <OrderLineRow
              key={field.id}
              index={index}
              register={register}
              watch={watch}
              setValue={setValue}
              errors={errors}
              typeOptions={typeOptions}
              onRemove={() => removeLine(index)}
            />
          ))}
        </div>

        {errors.items?.message && (
          <p className="text-body text-destructive">{t("order.emptyItems")}</p>
        )}
      </section>

      <OrderSummary
        items={items}
        shippingCost={Number(shippingCost || 0)}
        packingCost={Number(packingCost || 0)}
        advertisingCost={Number(advertisingCost || 0)}
      />

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => router.back()}
        >
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </form>
  )
}
