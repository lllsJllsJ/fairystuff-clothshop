import { posix as path } from "node:path"

import * as XLSX from "xlsx"

export type WorkbookImage = {
  row: number
  column: number
  mediaPath: string
  bytes: Buffer
}

export type WorkbookCatalogRow = {
  row: number
  workbookRef: string
  color: string | null
  originalPrice: number
  sellPrice: number
  originalPriceFormula: string | null
  sellPriceFormula: string | null
  buyingSource: string | null
  linkText: string | null
  linkTarget: string | null
  images: WorkbookImage[]
}

type BookFile = { content?: Uint8Array }
type WorkbookWithFiles = XLSX.WorkBook & { files?: Record<string, BookFile> }

function cell(sheet: XLSX.WorkSheet, column: string, row: number): XLSX.CellObject | undefined {
  return sheet[`${column}${row}`] as XLSX.CellObject | undefined
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized && normalized !== "-" ? normalized : null
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function workbookImages(book: WorkbookWithFiles): WorkbookImage[] {
  const files = book.files ?? {}
  const result: WorkbookImage[] = []

  for (const drawingPath of Object.keys(files).filter((name) => /^xl\/drawings\/drawing\d+\.xml$/.test(name))) {
    const drawing = Buffer.from(files[drawingPath]?.content ?? []).toString("utf8")
    const relationshipPath = path.join(
      path.dirname(drawingPath),
      "_rels",
      `${path.basename(drawingPath)}.rels`
    )
    const relationships = Buffer.from(files[relationshipPath]?.content ?? []).toString("utf8")
    const targets = new Map<string, string>()

    for (const match of relationships.matchAll(/<Relationship\b([^>]+)\/?>(?:<\/Relationship>)?/g)) {
      const id = match[1].match(/\bId="([^"]+)"/)?.[1]
      const target = match[1].match(/\bTarget="([^"]+)"/)?.[1]
      if (id && target) targets.set(id, path.normalize(path.join(path.dirname(drawingPath), target)))
    }

    for (const match of drawing.matchAll(/<xdr:(?:oneCellAnchor|twoCellAnchor)>[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/g)) {
      const anchor = match[0]
      const from = anchor.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/)?.[1]
      const row = Number(from?.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1]) + 1
      const column = Number(from?.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1]) + 1
      const relationshipId = anchor.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1]
      const mediaPath = relationshipId ? targets.get(relationshipId) : undefined
      const bytes = mediaPath ? files[mediaPath]?.content : undefined
      if (Number.isInteger(row) && Number.isInteger(column) && mediaPath && bytes?.length) {
        result.push({ row, column, mediaPath, bytes: Buffer.from(bytes) })
      }
    }
  }

  return result
}

function formulaRows(...formulas: Array<string | null>): number[] {
  const found = new Set<number>()
  for (const formula of formulas) {
    if (!formula) continue
    for (const match of formula.matchAll(/\b[EF](\d+)\b/gi)) found.add(Number(match[1]))
  }
  return [...found]
}

/**
 * Reads the reviewed workbook surface exactly: column E is cost and column F
 * is selling price. Formula cells use the cached numeric values stored in the
 * XLSX, while the formula itself is retained to resolve set-component photos.
 */
export function readWorkbookCatalog(workbookPath: string): WorkbookCatalogRow[] {
  const book = XLSX.readFile(workbookPath, {
    bookFiles: true,
    cellFormula: true,
    cellHTML: false,
  }) as WorkbookWithFiles
  const sheet = book.Sheets[book.SheetNames[0]]
  if (!sheet) throw new Error("The workbook has no worksheets")

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1")
  const allImages = workbookImages(book)
  const rows: WorkbookCatalogRow[] = []

  for (let row = 2; row <= range.e.r + 1; row += 1) {
    const workbookRef = text(cell(sheet, "A", row)?.v)
    const originalPrice = number(cell(sheet, "E", row)?.v)
    const sellPrice = number(cell(sheet, "F", row)?.v)
    if (!workbookRef || originalPrice === null || sellPrice === null) continue

    const originalPriceFormula = text(cell(sheet, "E", row)?.f)
    const sellPriceFormula = text(cell(sheet, "F", row)?.f)
    const componentRows = formulaRows(originalPriceFormula, sellPriceFormula)
    const ownImages = allImages.filter((image) => image.row === row && image.column === 3)
    const componentImages = allImages.filter(
      (image) => componentRows.includes(image.row) && image.column === 3
    )

    const linkCell = cell(sheet, "H", row) as (XLSX.CellObject & { l?: { Target?: string } }) | undefined
    rows.push({
      row,
      workbookRef,
      color: text(cell(sheet, "D", row)?.v),
      originalPrice,
      sellPrice,
      originalPriceFormula,
      sellPriceFormula,
      buyingSource: text(cell(sheet, "G", row)?.v),
      linkText: text(linkCell?.v),
      linkTarget: text(linkCell?.l?.Target),
      images: [...ownImages, ...componentImages].filter(
        (image, index, list) => list.findIndex((candidate) => candidate.mediaPath === image.mediaPath) === index
      ),
    })
  }

  if (rows.length !== 53) {
    throw new Error(`Expected 53 complete code-bearing rows, found ${rows.length}`)
  }
  return rows.sort((a, b) => a.row - b.row)
}
