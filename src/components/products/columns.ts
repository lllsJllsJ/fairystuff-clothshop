export type ProductColumnKey =
  | "row_number"
  | "code"
  | "name"
  | "type"
  | "characters"
  | "preorder"
  | "sell_price"
  | "original_price"
  | "margin"
  | "stock"
  | "status"
  | "actions"

/** Left-to-right order of all columns. */
export const ALL_COLUMNS: ProductColumnKey[] = [
  "row_number",
  "code",
  "name",
  "type",
  "characters",
  "preorder",
  "sell_price",
  "original_price",
  "margin",
  "stock",
  "status",
  "actions",
]

/** Always shown — the table is unusable without them. */
export const ALWAYS_ON: ProductColumnKey[] = ["row_number", "code", "name", "status", "actions"]

/** Columns the owner can hide (default: all on). */
export const TOGGLEABLE: ProductColumnKey[] = ALL_COLUMNS.filter(
  (c) => !ALWAYS_ON.includes(c)
)

/** i18n key used as each column's label. */
export const COLUMN_LABEL_KEY: Record<ProductColumnKey, string> = {
  row_number: "product.rowNumber",
  code: "product.code",
  name: "product.name",
  type: "product.type",
  characters: "product.characters",
  preorder: "product.preorderLeadTime",
  sell_price: "product.sellPrice",
  original_price: "product.originalPrice",
  margin: "product.margin",
  stock: "product.stock",
  status: "product.status",
  actions: "common.actions",
}

// Versioned so a future column-set change can invalidate old stored
// preferences without special-casing migration logic, matching
// carstockpro's stock/columns.ts convention.
const STORAGE_KEY = "clothshop.productColumns.v1"

/** Reads the persisted visible-column set; defaults to everything. */
export function loadVisibleColumns(): Set<ProductColumnKey> {
  if (typeof window === "undefined") return new Set(ALL_COLUMNS)
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set(ALL_COLUMNS)
    const saved = JSON.parse(raw) as string[]
    const visible = new Set<ProductColumnKey>(
      saved.filter((c): c is ProductColumnKey => ALL_COLUMNS.includes(c as ProductColumnKey))
    )
    for (const c of ALWAYS_ON) visible.add(c)
    return visible
  } catch {
    return new Set(ALL_COLUMNS)
  }
}

export function saveVisibleColumns(visible: Set<ProductColumnKey>): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...visible]))
  } catch {
    // ignore storage failures (private mode, quota)
  }
}
