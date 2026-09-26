import "server-only"

import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db"
import { productImages, products, productVariants } from "@/db/schema"
import { renderImageRenditions } from "@/lib/catalog/images"
import { downloadPublicImage, sha256 } from "@/lib/catalog/source"
import { bumpCode, nextProductCodeIn, withCodeRetry } from "@/lib/product-code"
import { productImageUrl } from "@/lib/product-image-keys"
import { deleteProductImageRenditions, putProductImage } from "@/lib/r2"
import type { ProductImportRowParsed } from "@/lib/validations/product"

/**
 * Upserts ONE product from an import row. Each row is its own transaction,
 * so one bad row never aborts the rest of the sheet.
 *
 * ---------------------------------------------------------------------
 * ORDER HISTORY IS NEVER TOUCHED
 * ---------------------------------------------------------------------
 * This writes `products`, `product_variants`, and `product_images` only.
 * Every order line already snapshotted its code, name, sell price, actual
 * and master cost when it was placed, and reports group on that snapshot —
 * so a price change here only affects FUTURE orders. Variants are upserted
 * in place (never delete + re-insert) and the product code is never
 * rewritten, so `order_items.product_variant_id` links and customers'
 * carts stay valid too.
 *
 * ---------------------------------------------------------------------
 * BLANK = KEEP
 * ---------------------------------------------------------------------
 * On an update, a field the sheet left blank (undefined here) keeps its
 * current value. A blank image cell leaves photos alone; a blank sizes +
 * colours pair leaves variants alone.
 */

export type ImportRowResult =
  | {
      sourceRow: number
      ok: true
      action: "created" | "updated"
      productCode: string
      imageWarnings: number
    }
  | { sourceRow: number; ok: false; error: string }

type ExistingImage = { id: string; storageKey: string | null; sourceUrl: string | null }

type ImagePlan = {
  /** In final order (index 0 = main photo). */
  ordered: ({ kind: "keep"; id: string } | { kind: "new"; storageKey: string; sourceUrl: string })[]
  /** Freshly uploaded keys — deleted again if the DB write fails. */
  uploadedKeys: string[]
  failed: number
}

function toNullable(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed.length ? trimmed : null
}

function toMoney(value: number): string {
  return value.toFixed(2)
}

/** `/api/images/<key>` (relative or absolute) -> `<key>`, else null. */
function ownImageKey(url: string): string | null {
  try {
    const { pathname } = new URL(url, "http://local")
    const prefix = "/api/images/"
    return pathname.startsWith(prefix) ? decodeURIComponent(pathname.slice(prefix.length)) : null
  } catch {
    return null
  }
}

/**
 * Resolves each URL to an existing image (our own exported URL, or a
 * source URL imported before) or downloads, renders 480/800/1600 WebP, and
 * uploads a new one. Runs BEFORE the transaction so no connection is held
 * open during network I/O. A URL that fails to download is skipped and
 * counted, never fatal to the row.
 */
async function planImages(
  productId: string,
  urls: string[],
  existing: ExistingImage[]
): Promise<ImagePlan> {
  const plan: ImagePlan = { ordered: [], uploadedKeys: [], failed: 0 }
  const used = new Set<string>()

  for (const [index, url] of urls.entries()) {
    const ownKey = ownImageKey(url)
    const match = existing.find(
      (image) =>
        !used.has(image.id) &&
        ((ownKey !== null && image.storageKey === ownKey) || image.sourceUrl === url)
    )
    if (match) {
      used.add(match.id)
      plan.ordered.push({ kind: "keep", id: match.id })
      continue
    }
    if (ownKey !== null) {
      // Our own URL, but not one of THIS product's images — never copy
      // another product's object by key; treat it as unavailable.
      plan.failed += 1
      continue
    }

    try {
      const bytes = await downloadPublicImage(url)
      const renditions = await renderImageRenditions(bytes)
      const hash = sha256(bytes).slice(0, 12)
      const keys = renditions.map(
        (r) => `products/${productId}/import-${Date.now()}-${index}-${hash}-${r.width}.webp`
      )
      await Promise.all(renditions.map((r, i) => putProductImage(productId, keys[i], r.buffer)))
      plan.uploadedKeys.push(...keys)
      // The widest rendition is the canonical key (see image-loader.ts).
      plan.ordered.push({ kind: "new", storageKey: keys[keys.length - 1], sourceUrl: url })
    } catch (error) {
      console.error("import image failed", url, error)
      plan.failed += 1
    }
  }
  return plan
}

async function cleanup(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      deleteProductImageRenditions(key).catch((error) => {
        console.error("Failed to delete storage object", key, error)
      })
    )
  )
}

/**
 * Upserts variants on (product, colour, size) — case-insensitive match
 * reuses the existing row (and its id); a listed combination is set to
 * the row's on/off; an existing combination NOT listed is switched off,
 * never deleted.
 */
async function upsertVariants(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  productId: string,
  variants: NonNullable<ProductImportRowParsed["variants"]>
): Promise<void> {
  const existing = await tx
    .select({ id: productVariants.id, color: productVariants.color, size: productVariants.size })
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
  const key = (color: string, size: string) => `${color.toLowerCase()}|${size.toLowerCase()}`
  const byKey = new Map(existing.map((row) => [key(row.color, row.size), row.id]))
  const listed = new Set<string>()

  for (const [sortOrder, variant] of variants.entries()) {
    const k = key(variant.color, variant.size)
    listed.add(k)
    const id = byKey.get(k)
    if (id) {
      await tx
        .update(productVariants)
        .set({ isAvailable: variant.isAvailable, sortOrder, updatedAt: new Date() })
        .where(eq(productVariants.id, id))
    } else {
      await tx.insert(productVariants).values({
        productId,
        color: variant.color,
        size: variant.size,
        isAvailable: variant.isAvailable,
        sortOrder,
      })
    }
  }

  const dropped = existing.filter((row) => !listed.has(key(row.color, row.size))).map((r) => r.id)
  if (dropped.length > 0) {
    await tx
      .update(productVariants)
      .set({ isAvailable: false, updatedAt: new Date() })
      .where(inArray(productVariants.id, dropped))
  }
}

async function applyImages(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  productId: string,
  plan: ImagePlan,
  existing: ExistingImage[]
): Promise<string[]> {
  const keptIds = new Set(plan.ordered.flatMap((item) => (item.kind === "keep" ? [item.id] : [])))
  const removed = existing.filter((image) => !keptIds.has(image.id))
  if (removed.length > 0) {
    await tx.delete(productImages).where(
      inArray(
        productImages.id,
        removed.map((image) => image.id)
      )
    )
  }
  for (const [sortOrder, item] of plan.ordered.entries()) {
    if (item.kind === "keep") {
      await tx
        .update(productImages)
        .set({ sortOrder })
        .where(and(eq(productImages.id, item.id), eq(productImages.productId, productId)))
    } else {
      await tx.insert(productImages).values({
        productId,
        url: productImageUrl(item.storageKey),
        storageKey: item.storageKey,
        sourceUrl: item.sourceUrl,
        sortOrder,
      })
    }
  }
  return removed.flatMap((image) => (image.storageKey ? [image.storageKey] : []))
}

export async function importProductRow(
  row: ProductImportRowParsed,
  userId: string
): Promise<ImportRowResult> {
  const fail = (error: string): ImportRowResult => ({ sourceRow: row.sourceRow, ok: false, error })

  const [existing] = row.productCode
    ? await db
        .select({ id: products.id, productCode: products.productCode })
        .from(products)
        .where(sql`lower(${products.productCode}) = lower(${row.productCode})`)
        .limit(1)
    : []

  if (!existing) {
    // Create: name required; a single item needs a type for its code.
    if (!row.productName) return fail("name_required")
    if ((row.kind ?? "single") === "single" && !row.productType) return fail("type_required")
  }

  const productId = existing?.id ?? crypto.randomUUID()
  const existingImages: ExistingImage[] = existing
    ? await db
        .select({
          id: productImages.id,
          storageKey: productImages.storageKey,
          sourceUrl: productImages.sourceUrl,
        })
        .from(productImages)
        .where(eq(productImages.productId, productId))
    : []

  const plan = row.imageUrls
    ? await planImages(productId, row.imageUrls, existingImages)
    : null

  let savedCode = existing?.productCode ?? ""
  let removedKeys: string[] = []
  try {
    if (existing) {
      await db.transaction(async (tx) => {
        await tx
          .update(products)
          .set({
            // productCode deliberately absent — codes never change.
            ...(row.productName !== undefined && { productName: row.productName }),
            ...(row.productType !== undefined && { productType: toNullable(row.productType) }),
            ...(row.audience !== undefined && { audience: row.audience }),
            ...(row.kind !== undefined && { kind: row.kind }),
            ...(row.description !== undefined && { description: toNullable(row.description) }),
            ...(row.sellPrice !== undefined && { sellPrice: toMoney(row.sellPrice) }),
            ...(row.originalPrice !== undefined && { originalPrice: toMoney(row.originalPrice) }),
            ...(row.buyingSource !== undefined && { buyingSource: toNullable(row.buyingSource) }),
            ...(row.sourceLink !== undefined && { sourceLink: toNullable(row.sourceLink) }),
            ...(row.status !== undefined && { status: row.status }),
            updatedAt: new Date(),
          })
          .where(eq(products.id, productId))
        if (row.variants) await upsertVariants(tx, productId, row.variants)
        if (plan) removedKeys = await applyImages(tx, productId, plan, existingImages)
      })
    } else {
      const kind = row.kind ?? "single"
      await withCodeRetry((attempt) =>
        db.transaction(async (tx) => {
          const minted = await nextProductCodeIn(tx, row.productType, kind)
          if (!minted) throw new Error("type_required")
          savedCode = attempt > 0 ? bumpCode(minted, attempt) : minted
          await tx.insert(products).values({
            id: productId,
            productCode: savedCode,
            productName: row.productName ?? savedCode,
            productType: toNullable(row.productType),
            audience: row.audience ?? "adult",
            kind,
            description: toNullable(row.description),
            sellPrice: toMoney(row.sellPrice ?? 0),
            originalPrice: toMoney(row.originalPrice ?? 0),
            buyingSource: toNullable(row.buyingSource),
            sourceLink: toNullable(row.sourceLink),
            status: row.status ?? "active",
            createdBy: userId,
          })
          if (row.variants) await upsertVariants(tx, productId, row.variants)
          if (plan) await applyImages(tx, productId, plan, [])
        })
      )
    }
  } catch (error) {
    if (plan) await cleanup(plan.uploadedKeys)
    if (error instanceof Error && error.message === "type_required") return fail("type_required")
    console.error("importProductRow failed", row.sourceRow, error)
    return fail("write_failed")
  }

  // Storage cleanup only after the DB commit — never undoes the write.
  await cleanup(removedKeys)

  return {
    sourceRow: row.sourceRow,
    ok: true,
    action: existing ? "updated" : "created",
    productCode: savedCode,
    imageWarnings: plan?.failed ?? 0,
  }
}
