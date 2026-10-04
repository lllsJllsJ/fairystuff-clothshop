"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form"
import { AlertTriangle, Loader2, Search, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatBaht } from "@/lib/format"
import { percentOff } from "@/lib/pricing"
import { costVariance, formatVariance } from "@/lib/cost-variance"
import type { OrderFormValues } from "@/lib/validations/order"
import type { ProductListResult, ProductWithRelations } from "@/db/queries/products"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SimpleSelect } from "@/components/ui/simple-select"
import { CreatableCombobox } from "@/components/ui/creatable-combobox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Field } from "@/components/orders/order-field"

/** "-" is the one-colour sentinel on `productVariants.color` (schema.ts
 * default) — never shown to the owner as a real colour choice, matching
 * `variant-matrix-editor.tsx`'s `NO_COLOR` convention. */
const NO_COLOR = "-"
const PICKER_PAGE_SIZE = 8

type SizeOption = { size: string; isAvailable: boolean }

type VariantMeta = {
  colors: string[]
  sizesByColor: Map<string, SizeOption[]>
}

/** Derives the picker's colour/size choices from one product's live variant
 * rows. Colours are deduped and the one-colour sentinel is filtered out of
 * the visible list; when a product truly has no colour axis, sizes are
 * grouped under the sentinel key internally so `sizeOptionsFor` still finds
 * them. */
function buildVariantMeta(product: ProductWithRelations): VariantMeta {
  const colors = Array.from(new Set(product.variants.map((v) => v.color))).filter(
    (c) => c !== NO_COLOR
  )
  const sizesByColor = new Map<string, SizeOption[]>()
  for (const v of product.variants) {
    const key = colors.length > 0 ? v.color : NO_COLOR
    const bucket = sizesByColor.get(key) ?? []
    bucket.push({ size: v.size, isAvailable: v.isAvailable })
    sizesByColor.set(key, bucket)
  }
  return { colors, sizesByColor }
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/**
 * One line of the order builder. The product search picker is a pure
 * autofill assist — snapshotting code/name/type/cost/price plus a
 * colour/size pair onto this line's plain fields the moment a product is
 * chosen — never a live link. Every field below stays a normal editable
 * input/select after that, so the owner can still hand-correct a snapshot
 * or, if they never open the picker at all, type an entire line for
 * something that isn't in the catalogue (`productId` then stays empty,
 * which `createOrder`/`updateOrder` store as `null` — a soft link only).
 *
 * Reuses `GET /api/admin/products` (already owner-gated, already returns
 * `ProductWithRelations` — code/name/type/cost/price plus `variants`) for
 * the search results instead of a new endpoint; see the phase report for
 * why a dedicated `product-lookup` route wasn't worth adding.
 */
export function OrderLineRow({
  index,
  register,
  watch,
  setValue,
  errors,
  typeOptions,
  onRemove,
}: {
  index: number
  register: UseFormRegister<OrderFormValues>
  watch: UseFormWatch<OrderFormValues>
  setValue: UseFormSetValue<OrderFormValues>
  errors: FieldErrors<OrderFormValues>
  typeOptions: string[]
  onRemove: () => void
}) {
  const t = useTranslations()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebounced(query)
  const [variantMeta, setVariantMeta] = useState<VariantMeta | null>(null)

  const productId = watch(`items.${index}.productId`) || ""
  const productCode = watch(`items.${index}.productCode`) || ""
  const productName = watch(`items.${index}.productName`) || ""
  const productType = watch(`items.${index}.productType`) || ""
  const color = watch(`items.${index}.color`) || ""
  const size = watch(`items.${index}.size`) || ""
  const sellPrice = watch(`items.${index}.sellPrice`)
  const regularPrice = watch(`items.${index}.regularPrice`)
  const quantity = watch(`items.${index}.quantity`)
  const lineTotal = Number(sellPrice || 0) * Number(quantity || 0)
  const actualCost = Number(watch(`items.${index}.productCost`) || 0)
  const masterCost = Number(watch(`items.${index}.masterCost`) || 0)
  const variance = costVariance(actualCost, masterCost)
  // Still on the catalogue price: the owner hasn't confirmed what the
  // supplier actually charged for this preorder yet.
  const stillMaster = masterCost > 0 && variance.tone === "same"

  const itemErrors = errors.items?.[index]

  const pickerQuery = useQuery<ProductListResult>({
    queryKey: ["order-product-picker", debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedQuery,
        status: "all",
        sort: "newest",
        page: "1",
        pageSize: String(PICKER_PAGE_SIZE),
      })
      const res = await fetch(`/api/admin/products?${params}`)
      if (!res.ok) throw new Error("failed")
      return res.json() as Promise<ProductListResult>
    },
    enabled: pickerOpen,
    placeholderData: (prev) => prev,
  })

  function selectProduct(product: ProductWithRelations & { effectivePrice?: string }) {
    setValue(`items.${index}.productId`, product.id, { shouldValidate: true })
    setValue(`items.${index}.productCode`, product.productCode, { shouldValidate: true })
    setValue(`items.${index}.productName`, product.productName, { shouldValidate: true })
    setValue(`items.${index}.productType`, product.productType ?? "", { shouldValidate: true })
    // Actual cost starts at the master; masterCost is the fixed baseline.
    setValue(`items.${index}.productCost`, Number(product.originalPrice), {
      shouldValidate: true,
    })
    setValue(`items.${index}.masterCost`, Number(product.originalPrice), {
      shouldValidate: true,
    })
    // Charge what the storefront charges right now (shop sale / product
    // discount applied); remember the regular price for "was ฿…".
    const charged = Number(product.effectivePrice ?? product.sellPrice)
    setValue(`items.${index}.sellPrice`, charged, { shouldValidate: true })
    setValue(
      `items.${index}.regularPrice`,
      charged < Number(product.sellPrice) ? Number(product.sellPrice) : null,
      { shouldValidate: true }
    )
    setValue(`items.${index}.preorderMinDays`, product.preorderMinDays, { shouldValidate: true })
    setValue(`items.${index}.preorderMaxDays`, product.preorderMaxDays, { shouldValidate: true })

    const meta = buildVariantMeta(product)
    setVariantMeta(meta)
    const firstColor = meta.colors[0] ?? NO_COLOR
    const firstSizes = meta.sizesByColor.get(firstColor) ?? []
    setValue(`items.${index}.color`, meta.colors.length > 0 ? firstColor : "", {
      shouldValidate: true,
    })
    setValue(`items.${index}.size`, firstSizes[0]?.size ?? "", { shouldValidate: true })

    setPickerOpen(false)
    setQuery("")
  }

  function clearProduct() {
    setValue(`items.${index}.productId`, "", { shouldValidate: true })
    setVariantMeta(null)
  }

  function handleColorChange(nextColor: string) {
    setValue(`items.${index}.color`, nextColor, { shouldValidate: true })
    const sizes = variantMeta?.sizesByColor.get(nextColor) ?? []
    setValue(`items.${index}.size`, sizes[0]?.size ?? "", { shouldValidate: true })
  }

  const colorOptions = variantMeta?.colors ?? []
  const sizeKey = colorOptions.length > 0 ? color || colorOptions[0] : NO_COLOR
  const sizeOptions = variantMeta?.sizesByColor.get(sizeKey) ?? []
  const hasNoVariants = !!variantMeta && colorOptions.length === 0 && sizeOptions.length === 0

  return (
    <div className="space-y-3 border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-body">{t("order.pickProduct")}</Label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger className="flex h-11 w-full items-center gap-2 border border-input bg-background px-2.5 text-left text-body outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {productCode || productName
                  ? `${productCode}${productName ? ` — ${productName}` : ""}`
                  : t("product.searchPlaceholder")}
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <div className="border-b border-border p-2">
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("product.searchPlaceholder")}
                />
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {pickerQuery.isLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (pickerQuery.data?.rows.length ?? 0) === 0 ? (
                  <p className="p-3 text-small text-muted-foreground">{t("product.empty")}</p>
                ) : (
                  pickerQuery.data!.rows.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProduct(p)}
                      className="flex w-full flex-col items-start gap-0.5 px-2.5 py-2 text-left hover:bg-muted"
                    >
                      <span className="text-body font-medium text-foreground">
                        {p.productName}
                      </span>
                      <span className="text-small text-muted-foreground">
                        {p.productCode}
                        {p.productType ? ` · ${p.productType}` : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {productId && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={clearProduct}
            aria-label={t("order.clearProduct")}
            className="mt-6"
          >
            <X className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={t("order.removeLine")}
          className="mt-6 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field
          label={t("product.code")}
          required
          error={itemErrors?.productCode && t("common.required")}
        >
          <Input {...register(`items.${index}.productCode`)} />
        </Field>
        <Field
          label={t("product.name")}
          required
          className="grid gap-1.5 sm:col-span-2"
          error={itemErrors?.productName && t("common.required")}
        >
          <Input {...register(`items.${index}.productName`)} />
        </Field>
        <Field label={t("product.type")}>
          <CreatableCombobox
            value={productType}
            onValueChange={(v) => setValue(`items.${index}.productType`, v)}
            options={typeOptions}
            placeholder={t("common.search")}
            createLabel={(q) => t("product.addOption", { value: q })}
          />
        </Field>
      </div>

      <div className="grid items-start gap-3 sm:grid-cols-4">
        <Field label={t("variant.color")}>
          {colorOptions.length > 0 ? (
            <SimpleSelect
              value={color || colorOptions[0]}
              onValueChange={handleColorChange}
              options={colorOptions.map((c) => ({ value: c, label: c }))}
            />
          ) : (
            <Input {...register(`items.${index}.color`)} />
          )}
        </Field>
        <Field label={t("variant.size")}>
          {sizeOptions.length > 0 ? (
            <SimpleSelect
              value={size || sizeOptions[0]?.size}
              onValueChange={(v) => setValue(`items.${index}.size`, v, { shouldValidate: true })}
              options={sizeOptions.map((s) => ({
                value: s.size,
                label: s.isAvailable ? s.size : `${s.size} (${t("order.sizeOff")})`,
              }))}
            />
          ) : (
            <Input {...register(`items.${index}.size`)} />
          )}
        </Field>
        {/* The one field the owner MUST look at per preorder line: what the
            supplier actually charged. Same label/input rhythm as its
            neighbours (so all four inputs line up); the highlight is on the
            input itself, with the master price and difference underneath. */}
        <div className="grid content-start gap-1.5">
          <Label
            htmlFor={`items-${index}-productCost`}
            className="text-body font-bold text-amber-800 dark:text-amber-300"
          >
            {t("order.actualCostPrice")}
          </Label>
          <Input
            id={`items-${index}-productCost`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            className="border-amber-400 bg-amber-50 font-bold tabular-nums ring-2 ring-amber-300 focus-visible:ring-amber-400 dark:bg-amber-950/40 dark:ring-amber-700"
            {...register(`items.${index}.productCost`)}
          />
          <p className="text-small text-muted-foreground">
            {t("order.masterCostLabel")} {formatBaht(masterCost)}
            {variance.tone !== "same" && (
              <span
                className={cn(
                  "ml-1 font-bold",
                  variance.tone === "over" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {formatVariance(variance, formatBaht)}
              </span>
            )}
          </p>
          {stillMaster && (
            <p className="flex items-start gap-1 text-small font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t("order.confirmActualCost")}
            </p>
          )}
        </div>
        <Field label={t("product.sellPrice")}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            {...register(`items.${index}.sellPrice`)}
          />
          {regularPrice != null && Number(regularPrice) > Number(sellPrice || 0) && (
            <p className="text-small font-bold text-sale">
              {t("discount.wasPrice", {
                price: formatBaht(Number(regularPrice)),
                percent: percentOff(Number(sellPrice || 0), Number(regularPrice)) ?? 0,
              })}
            </p>
          )}
        </Field>
      </div>

      {hasNoVariants && <p className="text-small text-muted-foreground">{t("order.noVariants")}</p>}

      <div className="flex items-end justify-between gap-3">
        <Field label={t("variant.quantity")} className="grid w-28 gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            {...register(`items.${index}.quantity`)}
          />
        </Field>
        <div className="text-right">
          <p className="text-small text-muted-foreground">{t("order.lineTotal")}</p>
          <p className="text-body font-bold text-foreground">{formatBaht(lineTotal)}</p>
        </div>
      </div>
    </div>
  )
}
