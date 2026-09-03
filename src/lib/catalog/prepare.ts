import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, extname, relative, resolve } from "node:path"

import sharp from "sharp"

import type { CatalogManifest, CatalogProduct, CatalogProductType } from "./schema"
import { validateCatalogManifest } from "./schema"
import {
  canonicalizeSource,
  downloadSupplierImage,
  extractFirstUrl,
  fetchSupplierPage,
  sha256,
} from "./source"
import { readWorkbookCatalog, type WorkbookCatalogRow } from "./workbook"

const COLOR_TERMS: Array<[RegExp, string]> = [
  [/multi.?colou?r|rainbow|bundle|หลายสี/i, "หลายสี"],
  [/lavender|light purple|purple|ม่วง/i, "ม่วง"],
  [/pink|ชมพู/i, "ชมพู"],
  [/butter yellow|yellow|เหลือง/i, "เหลือง"],
  [/emerald|green|เขียว/i, "เขียว"],
  [/navy|blue|ฟ้า|น้ำเงิน/i, "น้ำเงิน"],
  [/red|rose|แดง/i, "แดง"],
  [/coffee|brown|น้ำตาล/i, "น้ำตาล"],
  [/beige|cream|ครีม|เบจ/i, "ครีม"],
  [/black|ดำ/i, "ดำ"],
  [/white|ขาว/i, "ขาว"],
  [/gold|ทอง/i, "ทอง"],
  [/silver|เงิน/i, "เงิน"],
]

const TYPE_RULES: Array<[RegExp, CatalogProductType, string]> = [
  [/shoe|pump|heel|sandal|รองเท้า/i, "รองเท้า", "รองเท้าแฟชั่น"],
  [/wallet|handbag|purse|bag|กระเป๋า/i, "กระเป๋า", "กระเป๋าแฟชั่น"],
  [/workout|athletic|yoga|tennis|sports?|legging|skort|jumpsuit/i, "ชุดกีฬา", "ชุดกีฬาแฟชั่น"],
  [/skirt|กระโปรง/i, "กระโปรง", "กระโปรงแฟชั่น"],
  [/dress|gown|เดรส/i, "เดรส", "เดรสแฟชั่น"],
  [/corset|bustier|bandeau|bralette|blouse|tank|\btop\b/i, "เสื้อครอป", "เสื้อครอปแฟชั่น"],
  [/shirt|เสื้อเชิ้ต/i, "เสื้อเชิ้ต", "เสื้อเชิ้ตแฟชั่น"],
  [/shorts?|กางเกงขาสั้น/i, "กางเกงขาสั้น", "กางเกงขาสั้นแฟชั่น"],
  [/pants?|trousers?|กางเกง/i, "กางเกงขายาว", "กางเกงขายาวแฟชั่น"],
  [/cardigan|jacket|coat|เสื้อคลุม/i, "เสื้อคลุม", "เสื้อคลุมแฟชั่น"],
  [/necklace|earring|bracelet|jewelry|pendant|hair|headband|crown|glove|sock|accessor/i, "เครื่องประดับ", "เครื่องประดับแฟชั่น"],
]

/** Owner-approved temporary exception; replace with a reviewed image later. */
const TEMPORARY_NO_IMAGE_ROWS = new Set([77])

export type PrepareCatalogOptions = {
  workbookPath: string
  manifestPath: string
  cacheDir: string
  offline?: boolean
  imageOverrides?: Map<number, string[]>
}

function normalizeSource(value: string | null, canonical: string | null): string | null {
  if (canonical) return canonical
  const source = value?.trim()
  if (!source || source === "-") return null
  return /^shien$/i.test(source) ? "SHEIN" : source
}

function classify(row: WorkbookCatalogRow, sourceTitle: string | null): {
  productType: CatalogProductType
  productName: string
} {
  if (/^(SS|FF)/i.test(row.workbookRef)) {
    return { productType: "เซ็ต", productName: "เซ็ตแฟชั่นหลายชิ้น" }
  }
  const haystack = `${sourceTitle ?? ""} ${row.linkText ?? ""}`
  for (const [pattern, productType, productName] of TYPE_RULES) {
    if (pattern.test(haystack)) return { productType, productName }
  }
  return { productType: "เครื่องประดับ", productName: "สินค้าแฟชั่น" }
}

function detectTextColor(row: WorkbookCatalogRow, title: string | null, supplierColor: string | null): string | null {
  if (/^(SS|FF)/i.test(row.workbookRef)) return "หลายสี"
  const haystack = `${supplierColor ?? ""} ${row.color ?? ""} ${title ?? ""} ${row.linkText ?? ""}`
  for (const [pattern, color] of COLOR_TERMS) if (pattern.test(haystack)) return color
  return null
}

async function detectImageColor(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: 80, height: 80, fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const counts = new Map<string, number>()
  let dark = 0
  let neutral = 0

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const r = data[offset] / 255
    const g = data[offset + 1] / 255
    const b = data[offset + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    if (max > 0.94) continue // white studio/page background
    if (max < 0.18) {
      dark += 1
      continue
    }
    if (delta < 0.1) {
      neutral += 1
      continue
    }
    let hue = 0
    if (max === r) hue = 60 * (((g - b) / delta) % 6)
    else if (max === g) hue = 60 * ((b - r) / delta + 2)
    else hue = 60 * ((r - g) / delta + 4)
    if (hue < 0) hue += 360
    const color =
      hue < 15 || hue >= 345 ? "แดง" :
      hue < 45 ? (max > 0.72 ? "ครีม" : "น้ำตาล") :
      hue < 70 ? "เหลือง" :
      hue < 165 ? "เขียว" :
      hue < 255 ? "น้ำเงิน" :
      hue < 300 ? "ม่วง" : "ชมพู"
    counts.set(color, (counts.get(color) ?? 0) + 1)
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const chromatic = ranked.reduce((total, [, count]) => total + count, 0)
  if (ranked.length >= 3 && ranked[2][1] / Math.max(chromatic, 1) >= 0.15) return "หลายสี"
  if (ranked[0]) return ranked[0][0]
  return dark > neutral ? "ดำ" : "ครีม"
}

async function isCleanGalleryCandidate(
  buffer: Buffer,
  provenance: "supplier" | "workbook" | "reviewed"
): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0
    const minimumSide = provenance === "workbook" ? 200 : 300
    if (width < minimumSide || height < minimumSide) return false
    const ratio = width / height
    if (ratio < 0.4 || ratio > 2.2) return false
    if (provenance === "supplier" && width * height < 250_000) return false
    return ["jpeg", "png", "webp", "avif"].includes(metadata.format ?? "")
  } catch {
    return false
  }
}

function safeExtension(source: string): string {
  const extension = extname(new URL(source).pathname).toLowerCase()
  return [".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(extension) ? extension : ".img"
}

async function saveCandidate(
  buffer: Buffer,
  cacheDir: string,
  row: number,
  index: number,
  extension: string
): Promise<{ localPath: string; sha: string }> {
  const hash = sha256(buffer)
  const absolute = resolve(cacheDir, `row-${row}`, `${String(index).padStart(2, "0")}-${hash.slice(0, 12)}${extension}`)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, buffer)
  return { localPath: relative(process.cwd(), absolute), sha: hash }
}

async function prepareProduct(
  row: WorkbookCatalogRow,
  options: PrepareCatalogOptions
): Promise<CatalogProduct> {
  const rawLink = row.linkTarget ?? row.linkText
  const canonical = canonicalizeSource(rawLink, `row-${row.row}`)
  const warnings: string[] = []
  const supplierPage = canonical.url && !options.offline
    ? await fetchSupplierPage(canonical.url)
    : { title: null, color: null, imageUrls: [], warning: canonical.url ? "Supplier enrichment skipped in offline mode" : null }
  if (supplierPage.warning) warnings.push(supplierPage.warning)

  const titleFromLink = row.linkText && !extractFirstUrl(row.linkText)
    ? row.linkText.split(/\r?\n/)[0]?.trim() || null
    : null
  const sourceTitle = supplierPage.title ?? titleFromLink
  const textColor = detectTextColor(row, sourceTitle, supplierPage.color)
  let color = textColor ?? "หลายสี"
  const accepted: CatalogProduct["images"] = []
  const seen = new Set<string>()
  const colorEvidence: Buffer[] = []

  for (const overridePath of options.imageOverrides?.get(row.row) ?? []) {
    const buffer = await readFile(resolve(overridePath))
    if (!(await isCleanGalleryCandidate(buffer, "reviewed"))) {
      throw new Error(`Reviewed image override is invalid: ${overridePath}`)
    }
    const hash = sha256(buffer)
    if (seen.has(hash)) continue
    const saved = await saveCandidate(buffer, options.cacheDir, row.row, accepted.length, extname(overridePath) || ".img")
    seen.add(hash)
    colorEvidence.push(buffer)
    accepted.push({
      localPath: saved.localPath,
      sourceUrl: null,
      provenance: "reviewed",
      sha256: saved.sha,
      color,
    })
    warnings.push(`Reviewed image override used: ${basename(overridePath)}`)
  }

  for (const imageUrl of supplierPage.imageUrls) {
    try {
      const buffer = await downloadSupplierImage(imageUrl)
      const hash = sha256(buffer)
      if (seen.has(hash) || !(await isCleanGalleryCandidate(buffer, "supplier"))) continue
      const saved = await saveCandidate(buffer, options.cacheDir, row.row, accepted.length, safeExtension(imageUrl))
      seen.add(hash)
      colorEvidence.push(buffer)
      accepted.push({
        localPath: saved.localPath,
        sourceUrl: imageUrl,
        provenance: "supplier",
        sha256: saved.sha,
        color,
      })
    } catch (error) {
      warnings.push(`Supplier image rejected: ${error instanceof Error ? error.message : "unknown error"}`)
    }
  }

  if (accepted.length === 0) {
    for (const image of row.images) {
      if (!(await isCleanGalleryCandidate(image.bytes, "workbook"))) continue
      const hash = sha256(image.bytes)
      if (seen.has(hash)) continue
      const extension = extname(image.mediaPath) || ".img"
      const saved = await saveCandidate(image.bytes, options.cacheDir, row.row, accepted.length, extension)
      seen.add(hash)
      colorEvidence.push(image.bytes)
      accepted.push({
        localPath: saved.localPath,
        sourceUrl: null,
        provenance: "workbook",
        sha256: saved.sha,
        color,
      })
    }
    if (accepted.length > 0) {
      warnings.push("Using workbook embedded product photo because no clean supplier gallery was available")
    }
  }

  if (accepted.length === 0) {
    warnings.push(
      TEMPORARY_NO_IMAGE_ROWS.has(row.row)
        ? "TEMPORARY NO IMAGE: explicitly approved; upload a real product photo before activation"
        : "BLOCKING: no usable supplier or workbook product image; add a reviewed image before verification"
    )
  }

  if (!textColor && colorEvidence[0]) color = await detectImageColor(colorEvidence[0])
  for (const image of accepted) image.color = color

  if (row.sellPrice < row.originalPrice) {
    warnings.push(`NEGATIVE MARGIN: ${row.sellPrice - row.originalPrice}`)
  }
  if (!canonical.url) warnings.push("No accepted supplier URL; source identity is workbook-only")

  const classification = classify(row, sourceTitle)
  return {
    workbookRow: row.row,
    workbookRef: row.workbookRef,
    sourceIdentity: canonical.identity,
    sourceLink: canonical.url,
    sourceTitle,
    productName: `${classification.productName} สี${color}`,
    productType: classification.productType,
    description: null,
    originalPrice: row.originalPrice,
    sellPrice: row.sellPrice,
    buyingSource: normalizeSource(row.buyingSource, canonical.supplier),
    status: "active",
    color,
    imagePolicy:
      accepted.length === 0 && TEMPORARY_NO_IMAGE_ROWS.has(row.row)
        ? "temporary-none"
        : "required",
    images: accepted,
    warnings,
  }
}

export async function prepareCatalog(options: PrepareCatalogOptions): Promise<CatalogManifest> {
  const workbookBytes = await readFile(options.workbookPath)
  const rows = readWorkbookCatalog(options.workbookPath)
  await mkdir(options.cacheDir, { recursive: true })
  const products: CatalogProduct[] = []

  for (const row of rows) products.push(await prepareProduct(row, options))

  const repeated = new Map<string, number>()
  for (const product of products) repeated.set(product.sourceIdentity, (repeated.get(product.sourceIdentity) ?? 0) + 1)
  for (const product of products) {
    const count = repeated.get(product.sourceIdentity) ?? 0
    if (count > 1 && !product.sourceIdentity.startsWith("workbook:")) {
      product.warnings.push(`Repeated supplier identity retained as a separate workbook product (${count} rows)`)
    }
  }

  const manifest = validateCatalogManifest({
    version: 1,
    sourceWorkbook: relative(process.cwd(), options.workbookPath),
    sourceWorkbookSha256: sha256(workbookBytes),
    generatedAt: new Date().toISOString(),
    products,
  })
  await mkdir(dirname(options.manifestPath), { recursive: true })
  await writeFile(options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export async function verifyCatalogFiles(manifest: CatalogManifest): Promise<void> {
  const workbookBytes = await readFile(resolve(manifest.sourceWorkbook))
  if (sha256(workbookBytes) !== manifest.sourceWorkbookSha256) {
    throw new Error(`Workbook hash mismatch: ${manifest.sourceWorkbook}`)
  }
  for (const product of manifest.products) {
    if (product.status !== "active") throw new Error(`Row ${product.workbookRow} is not active`)
    if (product.images.length === 0 && product.imagePolicy !== "temporary-none") {
      throw new Error(`Row ${product.workbookRow} (${product.workbookRef}) has no reviewed product image`)
    }
    if (product.images.length > 0 && product.imagePolicy === "temporary-none") {
      throw new Error(`Row ${product.workbookRow} has images but is still marked temporary-none`)
    }
    for (const image of product.images) {
      const bytes = await readFile(resolve(image.localPath))
      if (sha256(bytes) !== image.sha256) throw new Error(`Image hash mismatch: ${image.localPath}`)
      if (!(await isCleanGalleryCandidate(bytes, image.provenance))) {
        throw new Error(`Image is no longer a valid gallery candidate: ${image.localPath}`)
      }
    }
  }
}
