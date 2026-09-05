"use client"

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, SquareArrowOutUpRight, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Link } from "@/i18n/navigation"
import { formatBaht, formatNumber } from "@/lib/format"
import type { ProductStatusValue, ProductWithRelations } from "@/db/queries/products"
import type { ProductInlineUpdateValues } from "@/lib/validations/product"
import { deleteProduct, updateProductInline } from "@/app/[locale]/admin/products/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableCell, TableRow } from "@/components/ui/table"
import { SimpleSelect } from "@/components/ui/simple-select"
import { CreatableCombobox } from "@/components/ui/creatable-combobox"
import { Badge } from "@/components/ui/badge"
import { ProductStatusBadge } from "@/components/products/product-admin-card"
import type { ProductColumnKey } from "@/components/products/columns"

/** Port of carstockpro's `stock-row.tsx` inline click-to-edit mechanics:
 * Enter/blur saves via `updateProductInline`, Escape cancels, and an
 * unchanged value sends no request. */

type Field = "productName" | "productType" | "sellPrice" | "originalPrice" | "status"

type Draft = {
  productCode: string
  productName: string
  productType: string
  sellPrice: string
  originalPrice: string
  status: ProductStatusValue
}

function toDraft(product: ProductWithRelations): Draft {
  return {
    productCode: product.productCode,
    productName: product.productName,
    productType: product.productType ?? "",
    sellPrice: product.sellPrice,
    originalPrice: product.originalPrice,
    status: product.status,
  }
}

function toValues(d: Draft): ProductInlineUpdateValues {
  return {
    productCode: d.productCode,
    productName: d.productName,
    productType: d.productType,
    sellPrice: d.sellPrice,
    originalPrice: d.originalPrice,
    status: d.status,
  }
}

/** Focus + select-all on mount so a click lands ready to overwrite. */
function focusOnMount(el: HTMLInputElement | null) {
  if (!el) return
  el.focus()
  try {
    el.select()
  } catch {
    // select() throws for some input types in some browsers — best effort.
  }
}

export function ProductRow({
  product,
  typeOptions,
  onSaved,
  visible,
  rowNumber,
}: {
  product: ProductWithRelations
  typeOptions: string[]
  onSaved: () => void
  visible: Set<ProductColumnKey>
  rowNumber: number
}) {
  const t = useTranslations()
  const show = (key: ProductColumnKey) => visible.has(key)
  const [draft, setDraft] = useState<Draft>(() => toDraft(product))
  const [field, setField] = useState<Field | null>(null)
  const [buffer, setBuffer] = useState("")
  const [saving, setSaving] = useState<Field | null>(null)
  const [deleting, setDeleting] = useState(false)
  const cancelNext = useRef(false)

  // Resync the draft when the row is refetched after a save — done during
  // render (React's "adjust state on prop change" pattern) so the new
  // values show without a flash. An in-progress edit in another cell
  // lives in `buffer`, so it survives this reset.
  const [syncedProduct, setSyncedProduct] = useState(product)
  if (product !== syncedProduct) {
    setSyncedProduct(product)
    setDraft(toDraft(product))
  }

  function startEdit(f: Field) {
    cancelNext.current = false
    setBuffer(draft[f])
    setField(f)
  }

  async function commit(f: Field, raw: string) {
    setField(null)
    if (raw === draft[f]) return // unchanged — no request

    const next = { ...draft, [f]: raw }
    setDraft(next) // optimistic
    setSaving(f)
    try {
      const result = await updateProductInline(product.id, toValues(next))
      if (!result.ok) {
        setDraft(toDraft(product)) // revert
        toast.error(errorMessage(result.error))
        return
      }
      onSaved()
    } finally {
      setSaving(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      e.currentTarget.blur() // blur commits
    } else if (e.key === "Escape") {
      cancelNext.current = true
      e.currentTarget.blur()
    }
  }

  function handleBlur(f: Field) {
    if (cancelNext.current) {
      cancelNext.current = false
      setField(null)
      return
    }
    commit(f, buffer)
  }

  // Combobox cells commit on blur only — Enter is left to the autocomplete
  // to select the highlighted item and keep focus. Escape cancels.
  function comboKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      cancelNext.current = true
      e.currentTarget.blur()
    }
  }

  async function handleDelete() {
    if (!confirm(t("product.deleteConfirm"))) return
    setDeleting(true)
    try {
      const result = await deleteProduct(product.id)
      if (!result.ok) {
        toast.error(errorMessage(result.error))
        return
      }
      toast.success(t("product.deleted"))
      onSaved()
    } finally {
      setDeleting(false)
    }
  }

  function errorMessage(code: string): string {
    if (code === "forbidden") return t("errors.forbidden")
    if (code === "unauthorized") return t("errors.unauthorized")
    if (code === "duplicate_code") return t("errors.duplicateCode")
    if (code === "invalid") return t("errors.invalid")
    if (code === "not_found") return t("errors.notFound")
    return t("errors.generic")
  }

  function triggerClass(extra?: string) {
    return cn(
      "flex h-8 w-full cursor-text items-center px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
      extra
    )
  }

  function textCell(
    f: Field,
    display: React.ReactNode,
    opts: {
      type?: "text" | "number"
      inputWidth?: string
      align?: "left" | "right"
      ariaLabel: string
    }
  ) {
    if (field === f) {
      return (
        <Input
          ref={focusOnMount}
          autoFocus
          type={opts.type ?? "text"}
          inputMode={opts.type === "number" ? "decimal" : undefined}
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => handleBlur(f)}
          className={cn("h-8", opts.inputWidth, opts.align === "right" && "text-right")}
          aria-label={opts.ariaLabel}
        />
      )
    }
    return (
      <button
        type="button"
        onClick={() => startEdit(f)}
        className={triggerClass(cn(opts.align === "right" && "justify-end tabular-nums"))}
      >
        {saving === f ? <Loader2 className="size-3.5 animate-spin" /> : display}
      </button>
    )
  }

  const totalQuantity = product.variants.reduce((sum, v) => sum + v.quantity, 0)
  const isSoldOut = product.variants.length > 0 && totalQuantity === 0
  const marginPreview = Number(draft.sellPrice || 0) - Number(draft.originalPrice || 0)

  return (
    <TableRow>
      {show("row_number") && (
        <TableCell className="w-14 px-2 text-center tabular-nums">{rowNumber}</TableCell>
      )}

      {show("code") && (
        // Read-only on purpose: codes are generated from the product type
        // at create and never change (src/lib/product-code.ts), so there is
        // nothing to edit here — the server ignores a code sent by an
        // inline save regardless.
        <TableCell className="p-1 font-medium">
          <span className="px-2 tabular-nums">{product.productCode}</span>
        </TableCell>
      )}

      {show("name") && (
        <TableCell className="p-1">
          {textCell("productName", draft.productName, {
            inputWidth: "w-44",
            ariaLabel: t("product.name"),
          })}
        </TableCell>
      )}

      {show("type") && (
        <TableCell className="p-1">
          {field === "productType" ? (
            <CreatableCombobox
              autoFocus
              value={buffer}
              onValueChange={setBuffer}
              onBlur={() => handleBlur("productType")}
              onKeyDown={comboKeyDown}
              options={typeOptions}
              placeholder={t("common.search")}
              createLabel={(q) => t("product.addOption", { value: q })}
              className="h-8 w-32"
            />
          ) : (
            <button
              type="button"
              onClick={() => startEdit("productType")}
              className={triggerClass()}
            >
              {saving === "productType" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                draft.productType || <span className="text-muted-foreground">—</span>
              )}
            </button>
          )}
        </TableCell>
      )}

      {show("characters") && (
        <TableCell className="max-w-48 px-2 text-small text-muted-foreground">
          {product.characters.length > 0
            ? product.characters.map((character) => character.name).join(", ")
            : "—"}
        </TableCell>
      )}

      {show("preorder") && (
        <TableCell className="whitespace-nowrap px-2 text-small">
          {product.preorderMinDays != null && product.preorderMaxDays != null
            ? t("product.preorderDaysRange", {
                min: product.preorderMinDays,
                max: product.preorderMaxDays,
              })
            : t("product.preorderNotSet")}
        </TableCell>
      )}

      {show("sell_price") && (
        <TableCell className="p-1">
          {textCell("sellPrice", formatBaht(Number(draft.sellPrice)), {
            type: "number",
            inputWidth: "w-24",
            align: "right",
            ariaLabel: t("product.sellPrice"),
          })}
        </TableCell>
      )}

      {show("original_price") && (
        <TableCell className="p-1">
          {textCell("originalPrice", formatBaht(Number(draft.originalPrice)), {
            type: "number",
            inputWidth: "w-24",
            align: "right",
            ariaLabel: t("product.originalPrice"),
          })}
        </TableCell>
      )}

      {show("margin") && (
        <TableCell className="px-2 text-right font-medium tabular-nums">
          {formatBaht(marginPreview)}
        </TableCell>
      )}

      {show("stock") && (
        <TableCell className="px-2 text-right tabular-nums">
          {isSoldOut ? (
            <Badge variant="destructive">{t("product.soldOut")}</Badge>
          ) : (
            formatNumber(totalQuantity)
          )}
        </TableCell>
      )}

      {show("status") && (
        <TableCell className="p-1">
          {field === "status" ? (
            <SimpleSelect
              value={draft.status}
              onValueChange={(v) => commit("status", v)}
              options={[
                { value: "draft", label: t("product.statusDraft") },
                { value: "active", label: t("product.statusActive") },
                { value: "archived", label: t("product.statusArchived") },
              ]}
              className="h-8 w-28"
            />
          ) : (
            <button
              type="button"
              onClick={() => startEdit("status")}
              className="flex h-8 cursor-pointer items-center px-1 hover:bg-muted"
            >
              {saving === "status" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ProductStatusBadge status={draft.status} />
              )}
            </button>
          )}
        </TableCell>
      )}

      {show("actions") && (
        <TableCell>
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              render={<Link href={`/admin/products/${product.id}/edit`} />}
              nativeButton={false}
              aria-label={t("common.edit")}
            >
              <SquareArrowOutUpRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive"
              onClick={handleDelete}
              disabled={deleting}
              aria-label={t("common.delete")}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  )
}
