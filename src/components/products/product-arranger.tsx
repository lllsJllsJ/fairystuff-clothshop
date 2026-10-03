"use client"

import { useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { arrayMove } from "@dnd-kit/sortable"
import { ArrowDownToLine, ArrowUpToLine, Loader2, RotateCcw, Save, Shirt } from "lucide-react"

import { cn } from "@/lib/utils"
import { useRouter } from "@/i18n/navigation"
import type { ProductSummaryEntry } from "@/db/queries/products"
import { saveProductOrder } from "@/app/[locale]/admin/products/actions"
import { Button } from "@/components/ui/button"
import {
  SORTABLE_DRAGGING_CLASS,
  SortableHandle,
  SortableList,
  useSortableRow,
} from "@/components/ui/sortable"
import { ProductStatusBadge } from "@/components/products/product-admin-card"

function orderKey(items: ProductSummaryEntry[]): string {
  return items.map((item) => item.id).join(",")
}

function ArrangeRow({
  product,
  position,
  isFirst,
  isLast,
  onToTop,
  onToBottom,
}: {
  product: ProductSummaryEntry
  position: number
  isFirst: boolean
  isLast: boolean
  onToTop: () => void
  onToBottom: () => void
}) {
  const t = useTranslations("product")
  const { rowProps, handleProps, isDragging } = useSortableRow(product.id)

  return (
    <li
      {...rowProps}
      className={cn(
        "flex items-center gap-2 border-b border-border bg-card p-2 last:border-b-0 sm:gap-3",
        isDragging && SORTABLE_DRAGGING_CLASS
      )}
    >
      <SortableHandle
        handleProps={handleProps}
        label={t("arrangeDragHandle", { name: product.productName })}
      />
      <span className="w-7 shrink-0 text-right text-small font-bold tabular-nums text-muted-foreground">
        {position}
      </span>
      <div className="relative aspect-[4/5] w-10 shrink-0 overflow-hidden border border-border bg-muted">
        {product.coverImageUrl ? (
          <Image src={product.coverImageUrl} alt="" fill sizes="40px" className="object-cover" />
        ) : (
          <Shirt className="absolute inset-0 m-auto size-4 text-muted-foreground opacity-40" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium">{product.productName}</p>
        <p className="flex items-center gap-2 text-small text-muted-foreground">
          <span className="tabular-nums">{product.productCode}</span>
          {product.status !== "active" && <ProductStatusBadge status={product.status} />}
        </p>
      </div>
      <div className="flex shrink-0">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onToTop}
          disabled={isFirst}
          aria-label={t("arrangeToTop", { name: product.productName })}
        >
          <ArrowUpToLine />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onToBottom}
          disabled={isLast}
          aria-label={t("arrangeToBottom", { name: product.productName })}
        >
          <ArrowDownToLine />
        </Button>
      </div>
    </li>
  )
}

/**
 * Drag-and-drop editor for the storefront's "recommended" order — what
 * `/shop` lists by default and what the home page's Featured grid shows.
 * `initial` arrives already in that order (getProductsForArrange), so the
 * screen opens showing what customers currently see.
 *
 * Edit-locally-then-Save, like PopularSettings: nothing is written until
 * Save, which sends the whole list to `saveProductOrder`. Reset sends an
 * empty list, which clears every position (newest-first again).
 */
export function ProductArranger({ initial }: { initial: ProductSummaryEntry[] }) {
  const t = useTranslations("product")
  const tErrors = useTranslations("errors")
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [saving, setSaving] = useState(false)

  // A save or reset refreshes the route; adopt the server's list when it
  // arrives (React's "adjust state on prop change" pattern, as ProductRow).
  const [syncedInitial, setSyncedInitial] = useState(initial)
  if (initial !== syncedInitial) {
    setSyncedInitial(initial)
    setItems(initial)
  }

  const isDirty = orderKey(items) !== orderKey(syncedInitial)

  function handleReorder(nextIds: string[]) {
    setItems((current) => {
      const byId = new Map(current.map((item) => [item.id, item]))
      return nextIds.flatMap((id) => byId.get(id) ?? [])
    })
  }

  function moveTo(index: number, target: number) {
    setItems((current) => arrayMove(current, index, target))
  }

  async function persist(orderedIds: string[]) {
    setSaving(true)
    try {
      const result = await saveProductOrder(orderedIds)
      if (!result.ok) {
        toast.error(tErrors("generic"))
        return
      }
      toast.success(t("arrangeSaved"))
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    if (!confirm(t("arrangeResetConfirm"))) return
    void persist([])
  }

  if (items.length === 0) {
    return <p className="py-16 text-center text-muted-foreground">{t("arrangeEmpty")}</p>
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-16 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2 md:-mx-6 md:px-6">
        <Button onClick={() => void persist(items.map((item) => item.id))} disabled={saving || !isDirty}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {t("arrangeSave")}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={saving}>
          <RotateCcw />
          {t("arrangeReset")}
        </Button>
        {isDirty && (
          <span role="status" className="text-small font-medium text-primary">
            {t("arrangeUnsaved")}
          </span>
        )}
      </div>

      <SortableList id="product-arranger" ids={items.map((item) => item.id)} onReorder={handleReorder}>
        <ol className="border border-border">
          {items.map((product, index) => (
            <ArrangeRow
              key={product.id}
              product={product}
              position={index + 1}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onToTop={() => moveTo(index, 0)}
              onToBottom={() => moveTo(index, items.length - 1)}
            />
          ))}
        </ol>
      </SortableList>
    </div>
  )
}
