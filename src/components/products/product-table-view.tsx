"use client"

import { useTranslations } from "next-intl"

import { formatNumber } from "@/lib/format"
import type { ProductWithRelations } from "@/db/queries/products"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ProductRow } from "@/components/products/product-row"
import { ALL_COLUMNS, COLUMN_LABEL_KEY, type ProductColumnKey } from "@/components/products/columns"

/**
 * The dense, inline-editable table view of the admin product list. Port of
 * carstockpro's `stock-table-view.tsx`: presentational only — it receives
 * the current page of rows and reports saves upward. `ProductBrowser`
 * holds the query, filters, pagination, and which columns are visible.
 */
export function ProductTableView({
  rows,
  typeOptions,
  onSaved,
  visible,
  startIndex,
}: {
  rows: ProductWithRelations[]
  typeOptions: string[]
  onSaved: () => void
  visible: Set<ProductColumnKey>
  /** Zero-based position of this page in the full filtered result. */
  startIndex: number
}) {
  const t = useTranslations()

  const shownColumns = ALL_COLUMNS.filter((c) => visible.has(c))

  // Page total only — the API returns one page at a time, so summing the
  // whole catalogue's stock would need a separate aggregate query.
  const pageStock = rows.reduce(
    (sum, product) => sum + product.variants.reduce((s, v) => s + v.quantity, 0),
    0
  )

  return (
    <div className="overflow-x-auto border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {shownColumns.map((col) => (
              <TableHead key={col} className={col === "actions" ? "text-right" : undefined}>
                {t(COLUMN_LABEL_KEY[col])}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((product, index) => (
            <ProductRow
              key={product.id}
              product={product}
              typeOptions={typeOptions}
              onSaved={onSaved}
              visible={visible}
              rowNumber={startIndex + index + 1}
            />
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={shownColumns.length} className="text-right font-medium">
              <span className="mr-2 font-normal text-muted-foreground">{t("product.stock")}</span>
              <span className="tabular-nums">{formatNumber(pageStock)}</span>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
