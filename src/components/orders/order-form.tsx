"use client"

import { useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
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
  quantity: 1,
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function OrderForm({
  order,
  types,
}: {
  order?: OrderWithItems
  types: ProductType[]
}) {
  const t = useTranslations()
  const router = useRouter()
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
      status: order?.status ?? "new",
      note: order?.note ?? "",
      items:
        order && order.items.length > 0
          ? order.items.map((item) => ({
              productId: item.productId ?? "",
              productCode: item.productCode,
              productName: item.productName,
              productType: item.productType ?? "",
              color: item.color ?? "",
              size: item.size ?? "",
              productCost: Number(item.productCost),
              sellPrice: Number(item.sellPrice),
              quantity: item.quantity,
            }))
          : [BLANK_ITEM],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({ control, name: "items" })

  const typeOptions = types.map((pt) => pt.name)
  const selectedStatus = watch("status") ?? "new"
  const items = watch("items") ?? []
  const shippingCost = watch("shippingCost")
  const packingCost = watch("packingCost")

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
              label: t(`order.status${statusLabelSuffix(s)}`),
            }))}
          />
        </Field>
        <Field label={t("order.shippingCost")}>
          <Input type="number" inputMode="decimal" step="0.01" min={0} {...register("shippingCost")} />
        </Field>
        <Field label={t("order.packingCost")}>
          <Input type="number" inputMode="decimal" step="0.01" min={0} {...register("packingCost")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("order.note")}>
            <Textarea rows={2} {...register("note")} />
          </Field>
        </div>
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

function statusLabelSuffix(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}
