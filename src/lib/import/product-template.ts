import * as XLSX from "xlsx"

import {
  isProductAudience,
  isProductKind,
  type ProductAudience,
  type ProductKind,
} from "@/lib/product-taxonomy"
import { isPresetSize, MAX_SIZE_LENGTH, normalizeSizes } from "@/lib/sizes"

/**
 * The product import/export template — ONE layout used both ways, so an
 * exported sheet can be edited and imported straight back (an upsert keyed
 * on product code). Client-safe: parsing runs in the browser so the owner
 * previews every row before anything is written.
 *
 *   Code | Name | Audience | Kind | Type | Colours | Sizes | Unavailable |
 *   Sell price | Cost price | Source | Source link | Status | Description |
 *   Image URLs  (always last)
 *
 * - Colours / Sizes: comma lists; the variants are their cross product.
 *   Sizes are free text — anything that isn't a preset is a custom size.
 * - Unavailable: `Colour/Size` pairs switched off (just `Size` for a
 *   one-colour product), comma-separated.
 * - Image URLs: any number, comma- (or newline-) separated, first = main
 *   photo.
 * - A BLANK cell on an existing product means "leave as is" — a sheet that
 *   only fills in prices never wipes sizes or photos.
 *
 * The older packed `ดำ S:3, ดำ M:5` size cell is still read (quantities are
 * ignored — the shop no longer tracks stock).
 */

export const MAX_IMAGE_URLS = 20
const ONE_COLOR = "-"

export type TemplateColumn =
  | "productCode"
  | "productName"
  | "audience"
  | "kind"
  | "productType"
  | "colors"
  | "sizes"
  | "unavailable"
  | "sellPrice"
  | "originalPrice"
  | "buyingSource"
  | "sourceLink"
  | "status"
  | "description"
  | "imageUrls"

/** Export header text per column — bilingual so one sheet reads for both
 * locales, and each header is also an exact-match import alias. */
export const TEMPLATE_HEADERS: Record<TemplateColumn, string> = {
  productCode: "รหัสสินค้า / Code",
  productName: "ชื่อสินค้า / Name",
  audience: "กลุ่มลูกค้า / Audience",
  kind: "รูปแบบ / Kind",
  productType: "ประเภท / Type",
  colors: "สี / Colours",
  sizes: "ไซซ์ / Sizes",
  unavailable: "ปิดการขาย / Unavailable",
  sellPrice: "ราคาขาย / Sell price",
  originalPrice: "ราคาทุน / Cost price",
  buyingSource: "แหล่งซื้อ / Source",
  sourceLink: "ลิงก์สินค้า / Source link",
  status: "สถานะ / Status",
  description: "รายละเอียด / Description",
  imageUrls: "รูปภาพ / Image URLs",
}

export const TEMPLATE_COLUMNS = Object.keys(TEMPLATE_HEADERS) as TemplateColumn[]

/**
 * Substring aliases, tried in THIS order after exact header matches fail.
 * Order matters where headers overlap: images before the link ("Image
 * URLs" contains "url"), unavailable before sizes ("ไซซ์ที่ปิด"), cost
 * before sell ("Cost price" contains "price"), link before source
 * ("Source link" contains "source").
 */
const HEADER_ALIASES: { column: TemplateColumn; aliases: string[] }[] = [
  { column: "imageUrls", aliases: ["รูปภาพ", "รูป", "image", "photo", "picture"] },
  { column: "unavailable", aliases: ["ปิดการขาย", "ไม่พร้อมขาย", "unavailable", "disabled"] },
  { column: "productCode", aliases: ["รหัสสินค้า", "รหัส", "productcode", "code", "sku"] },
  { column: "productName", aliases: ["ชื่อสินค้า", "ชื่อ", "productname", "name"] },
  { column: "audience", aliases: ["กลุ่มลูกค้า", "ผู้ใหญ่/เด็ก", "audience", "forwho", "age"] },
  { column: "kind", aliases: ["รูปแบบ", "kind", "settype"] },
  { column: "productType", aliases: ["ประเภท", "หมวดหมู่", "type", "category"] },
  { column: "originalPrice", aliases: ["ราคาทุน", "ทุน", "cost", "originalprice"] },
  { column: "sellPrice", aliases: ["ราคาขาย", "sellprice", "price"] },
  { column: "sourceLink", aliases: ["ลิงก์", "ลิงค์", "link", "url"] },
  { column: "buyingSource", aliases: ["แหล่งซื้อ", "แหล่งที่มา", "source"] },
  { column: "status", aliases: ["สถานะ", "status"] },
  { column: "description", aliases: ["รายละเอียด", "คำอธิบาย", "description", "detail"] },
  { column: "sizes", aliases: ["ไซซ์", "ไซส์", "size", "variant", "stock"] },
  { column: "colors", aliases: ["สี", "color", "colour"] },
]

/** Columns that must never be captured — totals/profit alongside real data. */
const EXCLUDED_HEADERS = ["กำไร", "profit", "margin", "ยอดรวม", "รวมทั้งหมด"]

export type ProductStatusCell = "draft" | "active" | "archived"

export type TemplateVariant = { color: string; size: string; isAvailable: boolean }

export type RowIssue =
  | "name_required"
  | "type_required"
  | "bad_audience"
  | "bad_kind"
  | "bad_status"
  | "bad_price"
  | "bad_image_url"
  | "too_many_images"
  | "bad_link"

/**
 * One parsed sheet row. `undefined` on an optional field = the cell was
 * blank = "leave the existing value" on an update (and the default on a
 * create).
 */
export type TemplateRow = {
  sourceRow: number
  productCode: string
  productName?: string
  audience?: ProductAudience
  kind?: ProductKind
  productType?: string
  /** undefined = sizes/colours cells both blank = variants untouched. */
  variants?: TemplateVariant[]
  sellPrice?: number
  originalPrice?: number
  buyingSource?: string
  sourceLink?: string
  status?: ProductStatusCell
  description?: string
  /** undefined = cell blank = photos untouched. */
  imageUrls?: string[]
  issues: RowIssue[]
}

export type ParseResult =
  | { ok: true; rows: TemplateRow[] }
  | { ok: false; error: "parse" | "no_rows" }

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
    raw: true,
  })
  return parseGrid(grid)
}

/** Parses an already-read grid (rows of cells). Exported for tests. */
export function parseGrid(grid: unknown[][]): ParseResult {
  if (!grid.length) return { ok: false, error: "no_rows" }
  const header = findHeaderRow(grid)
  if (!header) return { ok: false, error: "no_rows" }

  const rows: TemplateRow[] = []
  for (let i = header.index + 1; i < grid.length; i++) {
    const parsed = parseRow(grid[i], header.columns, i + 1)
    if (parsed) rows.push(parsed)
  }
  return rows.length ? { ok: true, rows } : { ok: false, error: "no_rows" }
}

/** Sheets often start with a merged title row — scan until a row maps at
 * least two known columns. */
function findHeaderRow(
  grid: unknown[][]
): { index: number; columns: Map<TemplateColumn, number> } | null {
  const limit = Math.min(grid.length, 20)
  for (let i = 0; i < limit; i++) {
    const columns = mapColumns(grid[i])
    if (columns.size >= 2) return { index: i, columns }
  }
  return null
}

const EXACT_HEADERS = new Map<string, TemplateColumn>(
  TEMPLATE_COLUMNS.map((column) => [normalizeHeader(TEMPLATE_HEADERS[column]), column])
)

function mapColumns(row: unknown[]): Map<TemplateColumn, number> {
  const columns = new Map<TemplateColumn, number>()
  if (!Array.isArray(row)) return columns

  row.forEach((cell, index) => {
    const text = normalizeHeader(cell)
    if (!text) return
    const exact = EXACT_HEADERS.get(text)
    if (exact && !columns.has(exact)) {
      columns.set(exact, index)
      return
    }
    if (EXCLUDED_HEADERS.some((x) => text.includes(x))) return
    for (const { column, aliases } of HEADER_ALIASES) {
      if (columns.has(column)) continue
      if (aliases.some((alias) => text.includes(alias))) {
        columns.set(column, index)
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
  columns: Map<TemplateColumn, number>,
  sourceRow: number
): TemplateRow | null {
  if (!Array.isArray(row)) return null
  const raw = (column: TemplateColumn): unknown => {
    const index = columns.get(column)
    return index == null ? null : row[index]
  }
  const text = (column: TemplateColumn): string | undefined => cellText(raw(column)) || undefined

  const productCode = text("productCode") ?? ""
  const productName = text("productName")
  // Nothing identifying: a spacer or totals line, not a product.
  if (!productCode && !productName) return null

  const issues: RowIssue[] = []

  const audienceText = text("audience")
  const audience = audienceText === undefined ? undefined : parseAudience(audienceText)
  if (audienceText !== undefined && !audience) issues.push("bad_audience")

  const kindText = text("kind")
  const kind = kindText === undefined ? undefined : parseKind(kindText)
  if (kindText !== undefined && !kind) issues.push("bad_kind")

  const statusText = text("status")
  const status = statusText === undefined ? undefined : parseStatus(statusText)
  if (statusText !== undefined && !status) issues.push("bad_status")

  const sellPrice = money(raw("sellPrice"))
  const originalPrice = money(raw("originalPrice"))
  if (sellPrice === null || originalPrice === null) issues.push("bad_price")

  const sourceLink = text("sourceLink")
  if (sourceLink && !isHttpUrl(sourceLink)) issues.push("bad_link")

  const imageCell = rawText(raw("imageUrls"))
  let imageUrls: string[] | undefined
  if (imageCell.trim()) {
    const parsedImages = parseImageUrls(imageCell)
    imageUrls = parsedImages.urls
    if (parsedImages.invalid > 0) issues.push("bad_image_url")
    if (parsedImages.urls.length > MAX_IMAGE_URLS) issues.push("too_many_images")
  }

  return {
    sourceRow,
    productCode,
    productName,
    audience,
    kind,
    productType: text("productType"),
    variants: parseVariants(text("colors"), rawText(raw("sizes")), text("unavailable")),
    sellPrice: sellPrice ?? undefined,
    originalPrice: originalPrice ?? undefined,
    buyingSource: text("buyingSource"),
    sourceLink,
    status,
    description: rawText(raw("description")).trim() || undefined,
    imageUrls,
    issues,
  }
}

/** Issues that only apply to a row that will CREATE a product. */
export function createIssues(row: TemplateRow): RowIssue[] {
  const issues: RowIssue[] = []
  if (!row.productName?.trim()) issues.push("name_required")
  if ((row.kind ?? "single") === "single" && !row.productType?.trim()) {
    issues.push("type_required")
  }
  return issues
}

// ---------------------------------------------------------------------------
// Cell parsers (exported for tests)
// ---------------------------------------------------------------------------

const AUDIENCE_WORDS: Record<string, ProductAudience> = {
  adult: "adult",
  adults: "adult",
  ผู้ใหญ่: "adult",
  kid: "kids",
  kids: "kids",
  child: "kids",
  children: "kids",
  เด็ก: "kids",
}

export function parseAudience(value: string): ProductAudience | undefined {
  const key = value.trim().toLowerCase()
  if (isProductAudience(key)) return key
  return AUDIENCE_WORDS[key]
}

const KIND_WORDS: Record<string, ProductKind> = {
  single: "single",
  item: "single",
  ชิ้นเดี่ยว: "single",
  เดี่ยว: "single",
  set: "set",
  เซ็ต: "set",
  เซต: "set",
  fullset: "fullset",
  "full set": "fullset",
  ฟูลเซ็ต: "fullset",
  ฟูลเซต: "fullset",
  เซ็ตเต็ม: "fullset",
}

export function parseKind(value: string): ProductKind | undefined {
  const key = value.trim().toLowerCase().replace(/\s+/g, " ")
  if (isProductKind(key)) return key
  return KIND_WORDS[key] ?? KIND_WORDS[key.replace(/\s/g, "")]
}

const STATUS_WORDS: Record<string, ProductStatusCell> = {
  active: "active",
  เผยแพร่: "active",
  draft: "draft",
  แบบร่าง: "draft",
  archived: "archived",
  เก็บถาวร: "archived",
}

export function parseStatus(value: string): ProductStatusCell | undefined {
  return STATUS_WORDS[value.trim().toLowerCase()]
}

/** Splits a comma list; trims; drops blanks. */
export function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,;\n]/)
    .map((part) => collapse(part))
    .filter(Boolean)
}

/**
 * Colours x sizes -> variants, with `unavailable` pairs switched off.
 * Returns undefined when both cells are blank (= leave variants as is).
 */
export function parseVariants(
  colorsCell: string | undefined,
  sizesCell: string,
  unavailableCell: string | undefined
): TemplateVariant[] | undefined {
  const colors = splitList(colorsCell)
  if (!sizesCell.trim() && colors.length === 0) return undefined

  const off = new Set(
    splitList(unavailableCell).map((pair) => {
      const [a, b] = pair.split("/").map((part) => part.trim().toLowerCase())
      return b === undefined ? `${ONE_COLOR}|${a}` : `${a}|${b}`
    })
  )

  if (/:\s*\d+/.test(sizesCell)) return parseLegacyVariants(sizesCell, colors[0] ?? ONE_COLOR, off)

  const sizes = normalizeSizes(splitList(sizesCell))
  if (sizes.length === 0) return []
  const effectiveColors = colors.length > 0 ? colors : [ONE_COLOR]
  return effectiveColors.flatMap((color) =>
    sizes.map((size) => ({
      color,
      size,
      isAvailable: !isOff(off, color, size, colors.length === 0),
    }))
  )
}

function isOff(off: Set<string>, color: string, size: string, oneColor: boolean): boolean {
  const key = `${color.toLowerCase()}|${size.toLowerCase()}`
  if (off.has(key)) return true
  // A bare "M" in the unavailable cell means "M in every colour" for a
  // one-colour product.
  return oneColor && off.has(`${ONE_COLOR}|${size.toLowerCase()}`)
}

/**
 * The old packed cell: `ดำ S:3, ดำ M:5`, `S:3;M:5`, `Free Size:2`. Split on
 * the LAST colon; if the left side is a preset size (or has no space) it's
 * all size, otherwise the first word is the colour — so `Free Size:2` stays
 * one size instead of colour "Free". Quantities are ignored.
 */
function parseLegacyVariants(
  cell: string,
  fallbackColor: string,
  off: Set<string>
): TemplateVariant[] {
  const out: TemplateVariant[] = []
  const seen = new Set<string>()
  for (const token of splitList(cell)) {
    const colon = token.lastIndexOf(":")
    const left = (colon === -1 ? token : token.slice(0, colon)).trim()
    if (!left) continue
    let color = fallbackColor
    let size = left
    const space = left.indexOf(" ")
    if (!isPresetSize(left) && space > 0) {
      color = left.slice(0, space)
      size = left.slice(space + 1).trim()
    }
    size = size.slice(0, MAX_SIZE_LENGTH)
    const key = `${color.toLowerCase()}|${size.toLowerCase()}`
    if (!size || seen.has(key)) continue
    seen.add(key)
    out.push({ color, size, isAvailable: !off.has(key) })
  }
  return out
}

/**
 * Image cell -> URLs. Comma / newline / whitespace separated (a URL never
 * contains a raw space), trimmed, exact duplicates dropped, order kept
 * (first = main photo). Only http(s) URLs count; anything else is reported
 * as `invalid` so the preview can flag the row.
 */
export function parseImageUrls(cell: string): { urls: string[]; invalid: number } {
  const urls: string[] = []
  let invalid = 0
  for (const part of cell.split(/[\s,]+/)) {
    const candidate = part.trim()
    if (!candidate) continue
    if (!isHttpUrl(candidate)) {
      invalid += 1
      continue
    }
    if (!urls.includes(candidate)) urls.push(candidate)
  }
  return { urls, invalid }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function rawText(cell: unknown): string {
  if (cell == null || cell instanceof Date) return ""
  return String(cell)
}

function cellText(cell: unknown): string {
  return collapse(rawText(cell))
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/** undefined = blank; null = present but not a number; else the value.
 * Strips `,` and `บาท`: "1,250 บาท" -> 1250. */
export function money(cell: unknown): number | undefined | null {
  if (cell == null || cell === "") return undefined
  if (typeof cell === "number") return Number.isFinite(cell) && cell >= 0 ? cell : null
  const text = String(cell).trim()
  if (!text) return undefined
  const digits = text.replace(/[^0-9.-]/g, "")
  if (!digits || digits === "-" || digits === ".") return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

// ---------------------------------------------------------------------------
// Export: product -> sheet row (the exact inverse of parseRow)
// ---------------------------------------------------------------------------

export type ExportableProduct = {
  productCode: string
  productName: string
  audience: ProductAudience
  kind: ProductKind
  productType: string | null
  sellPrice: string
  originalPrice: string
  buyingSource: string | null
  sourceLink: string | null
  status: ProductStatusCell
  description: string | null
  variants: { color: string; size: string; isAvailable: boolean }[]
  /** Absolute URLs, main photo first. */
  imageUrls: string[]
}

export function toTemplateRow(product: ExportableProduct): Record<string, string | number> {
  const colors = Array.from(new Set(product.variants.map((v) => v.color)))
  const sizes = Array.from(new Set(product.variants.map((v) => v.size)))
  const oneColor = colors.length === 1 && colors[0] === ONE_COLOR
  const unavailable = product.variants
    .filter((v) => !v.isAvailable)
    .map((v) => (oneColor ? v.size : `${v.color}/${v.size}`))

  const values: Record<TemplateColumn, string | number> = {
    productCode: product.productCode,
    productName: product.productName,
    audience: product.audience,
    kind: product.kind,
    productType: product.productType ?? "",
    colors: oneColor ? "" : colors.join(", "),
    sizes: sizes.join(", "),
    unavailable: unavailable.join(", "),
    sellPrice: Number(product.sellPrice),
    originalPrice: Number(product.originalPrice),
    buyingSource: product.buyingSource ?? "",
    sourceLink: product.sourceLink ?? "",
    status: product.status,
    description: product.description ?? "",
    imageUrls: product.imageUrls.join(", "),
  }
  return Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [TEMPLATE_HEADERS[c], values[c]]))
}
