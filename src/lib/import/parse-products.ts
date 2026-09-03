import * as XLSX from "xlsx"

/**
 * Port of carstockpro's `lib/import/parse-cars.ts`. Keeps the whole engine
 * — `findHeaderRow` (scans past a merged title row), `mapColumns`,
 * `EXCLUDED_HEADERS`, and the `number()` helper (strips `,` and `บาท`) —
 * and swaps `HEADER_ALIASES` for product ones. Drops `parseModelText` and
 * the Buddhist-era `toCommonEra` conversion (no purchase-date column
 * here); adds `parseVariantCell()` for the "ไซซ์" column, which packs the
 * whole colour x size x qty matrix for one product into a single cell
 * (e.g. "ดำ S:3, ดำ M:5" or the bare "S:3;M:5").
 */

export type ParsedProductVariant = {
  color: string
  size: string
  quantity: number
}

export type ParsedProductRow = {
  /** Stable key for React lists; not persisted. */
  key: string
  /** 1-based row number in the source sheet, shown in the preview. */
  sourceRow: number
  productCode: string
  productName: string
  productType: string
  sellPrice: number
  originalPrice: number
  buyingSource: string
  sourceLink: string
  variants: ParsedProductVariant[]
  /** Unticked rows are left out of the import. */
  include: boolean
}

type ColumnKind =
  | "productCode"
  | "productName"
  | "productType"
  | "color"
  | "sellPrice"
  | "originalPrice"
  | "buyingSource"
  | "sourceLink"
  | "size"

/**
 * Header aliases in match order: รหัสสินค้า/code, ชื่อสินค้า/name,
 * ประเภท/type, สี/colour, ราคาขาย/price, ราคาทุน/cost, แหล่งซื้อ/source,
 * ลิงก์/link, ไซซ์/size (plan §12). None of these currently collide as
 * substrings of one another, but keep the ordering intentional if more
 * aliases are added later.
 */
const HEADER_ALIASES: { kind: ColumnKind; aliases: string[] }[] = [
  {
    kind: "productCode",
    aliases: ["รหัสสินค้า", "รหัส", "productcode", "code", "sku"],
  },
  { kind: "productName", aliases: ["ชื่อสินค้า", "ชื่อ", "productname", "name"] },
  { kind: "productType", aliases: ["ประเภท", "หมวดหมู่", "type", "category"] },
  { kind: "color", aliases: ["สี", "color", "colour"] },
  { kind: "sellPrice", aliases: ["ราคาขาย", "sellprice", "price"] },
  { kind: "originalPrice", aliases: ["ราคาทุน", "ทุน", "cost", "originalprice"] },
  { kind: "buyingSource", aliases: ["แหล่งซื้อ", "แหล่งที่มา", "source"] },
  { kind: "sourceLink", aliases: ["ลิงก์", "ลิงค์", "link", "url"] },
  { kind: "size", aliases: ["ไซซ์", "ไซส์", "size", "variant", "stock"] },
]

/** Columns that must never be captured by a legitimate alias above — e.g.
 * a sheet's totals/profit row sitting alongside the real data. */
const EXCLUDED_HEADERS = ["กำไร", "profit", "margin", "ยอดรวม", "รวมทั้งหมด"]

export type ParseResult =
  | { ok: true; rows: ParsedProductRow[] }
  | { ok: false; error: "parse" | "no_rows" }

/**
 * Reads a product stock sheet into editable draft rows. Sheets often start
 * with a merged title row, so the header is not necessarily row 1 —
 * `findHeaderRow` scans past it. Everything here is best-effort; the
 * caller shows the result for the owner to correct before anything is
 * saved.
 */
export function parseProductWorkbook(data: ArrayBuffer): ParseResult {
  let sheet: XLSX.WorkSheet | undefined
  try {
    const workbook = XLSX.read(data, { cellDates: true })
    const name = workbook.SheetNames[0]
    sheet = name ? workbook.Sheets[name] : undefined
  } catch {
    return { ok: false, error: "parse" }
  }
  if (!sheet) return { ok: false, error: "parse" }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
  })
  if (!grid.length) return { ok: false, error: "no_rows" }

  const header = findHeaderRow(grid)
  if (!header) return { ok: false, error: "no_rows" }

  const rows: ParsedProductRow[] = []
  for (let i = header.index + 1; i < grid.length; i++) {
    const row = grid[i]
    const parsed = parseRow(row, header.columns, i + 1)
    if (parsed) rows.push(parsed)
  }

  if (!rows.length) return { ok: false, error: "no_rows" }
  return { ok: true, rows }
}

/**
 * Locates the header row and its column positions. Sheets often start with
 * a merged title row, so the header is not necessarily row 1 — scan until
 * a row maps at least two known columns.
 */
function findHeaderRow(
  grid: unknown[][]
): { index: number; columns: Map<ColumnKind, number> } | null {
  const limit = Math.min(grid.length, 20)
  for (let i = 0; i < limit; i++) {
    const columns = mapColumns(grid[i])
    // One match is too weak — a stray "สี" in a title would qualify.
    if (columns.size >= 2) return { index: i, columns }
  }
  return null
}

function mapColumns(row: unknown[]): Map<ColumnKind, number> {
  const columns = new Map<ColumnKind, number>()
  if (!Array.isArray(row)) return columns

  row.forEach((cell, index) => {
    const text = normalizeHeader(cell)
    if (!text) return
    if (EXCLUDED_HEADERS.some((x) => text.includes(x))) return

    for (const { kind, aliases } of HEADER_ALIASES) {
      if (columns.has(kind)) continue
      if (aliases.some((alias) => text.includes(alias))) {
        columns.set(kind, index)
        return
      }
    }
  })

  return columns
}

function normalizeHeader(cell: unknown): string {
  if (cell == null) return ""
  return String(cell).toLowerCase().replace(/\s+/g, "")
}

function parseRow(
  row: unknown[],
  columns: Map<ColumnKind, number>,
  sourceRow: number
): ParsedProductRow | null {
  if (!Array.isArray(row)) return null

  const cell = (kind: ColumnKind): unknown => {
    const index = columns.get(kind)
    return index == null ? null : row[index]
  }

  const productCode = cellText(cell("productCode"))
  const productName = cellText(cell("productName"))

  // A row with nothing identifying is a spacer or a totals line, not a
  // product.
  if (!productCode && !productName) return null

  const fallbackColor = cellText(cell("color")) || "-"

  return {
    key: `${sourceRow}-${productCode || productName}`,
    sourceRow,
    productCode,
    productName,
    productType: cellText(cell("productType")),
    sellPrice: number(cell("sellPrice")) ?? 0,
    originalPrice: number(cell("originalPrice")) ?? 0,
    buyingSource: cellText(cell("buyingSource")),
    sourceLink: cellText(cell("sourceLink")),
    variants: parseVariantCell(cell("size"), fallbackColor),
    include: productCode.length > 0,
  }
}

/**
 * Parses a "ไซซ์" cell such as `"ดำ S:3, ดำ M:5"` or `"S:3;M:5"` into
 * variant rows. Tokens are split on `,`/`;`; each token is
 * `<colour>? <size>:<qty>` — a bare `S:3` (no colour prefix) falls back to
 * `fallbackColor` (the row's "สี" column value if the sheet has one,
 * otherwise `"-"`, the one-colour sentinel). Malformed tokens are silently
 * skipped — this parser is best-effort, like the rest of the engine.
 */
export function parseVariantCell(
  raw: unknown,
  fallbackColor = "-"
): ParsedProductVariant[] {
  const value = cellText(raw)
  if (!value) return []

  const variants: ParsedProductVariant[] = []
  for (const token of value.split(/[,;]/)) {
    const trimmed = token.trim()
    if (!trimmed) continue

    const match = trimmed.match(/^(?:(.+?)\s+)?(\S+)\s*:\s*(\d+)\s*$/)
    if (!match) continue

    const [, colorPart, sizePart, qtyPart] = match
    const color = colorPart?.trim() || fallbackColor
    const size = sizePart.trim()
    const quantity = Number(qtyPart)
    if (!size || !Number.isFinite(quantity)) continue

    variants.push({ color, size, quantity })
  }
  return variants
}

function cellText(cell: unknown): string {
  if (cell == null) return ""
  if (cell instanceof Date) return ""
  return collapse(String(cell))
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/** Strips `,` and `บาท` (and any other non-numeric noise) from a money
 * cell, e.g. "1,250 บาท" -> 1250. */
function number(cell: unknown): number | null {
  if (cell == null || cell === "") return null
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null
  const digits = String(cell).replace(/[^0-9.-]/g, "")
  if (!digits || digits === "-" || digits === ".") return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : null
}
