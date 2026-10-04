"use server"

import { count, eq, inArray, isNotNull, max } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import {
  characters,
  customerOrderStage,
  customerStatusLabels,
  orderItems,
  orderItemStatuses,
  orderStatus,
  orderStatusLabels,
  productCharacters,
  productColors,
  products,
  productVariants,
  shopSettings,
} from "@/db/schema"
import { getCurrentUser } from "@/lib/auth-helpers"
import { isOwner } from "@/lib/roles"
import { isValidFacebookUrl, normalizeFacebookUrl } from "@/lib/facebook"
import { seedCharacters } from "@/lib/character-seed"
import { toEnglishColor } from "@/lib/colors"
import { MAX_HERO_IMAGES, isBrandLogoKey, isHeroImageKey } from "@/lib/brand-image-keys"
import { deleteBrandLogoRenditions, deleteHeroImageRenditions } from "@/lib/r2"
import { popularProductIdsSchema } from "@/lib/validations/product"
import { shopSaleSchema, type ShopSaleInput } from "@/lib/validations/sale"
import { revalidateStorefront } from "@/app/[locale]/admin/products/revalidate"
import { revalidateSettings } from "./revalidate"

type Result = { ok: true } | { ok: false; error: string }
type SeedResult =
  | { ok: true; deleted: string[]; skipped: string[] }
  | { ok: false; error: string }
const label = z.string().trim().min(1).max(80)
const id = z.uuid()

async function owner(): Promise<boolean> {
  const user = await getCurrentUser()
  return !!user && isOwner(user.role)
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-").replace(/^-+|-+$/g, "") || `character-${Date.now()}`
}

export async function saveShopContacts(lineId: string, instagramHandle: string, facebookUrl: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = z.object({
    lineId: z.string().trim().max(100),
    instagramHandle: z.string().trim().max(100),
    facebookUrl: z.string().trim().max(500).transform(normalizeFacebookUrl).refine(isValidFacebookUrl),
  }).safeParse({ lineId, instagramHandle, facebookUrl })
  if (!parsed.success) return { ok: false, error: "invalid" }
  const contacts = {
    lineId: parsed.data.lineId || null,
    instagramHandle: parsed.data.instagramHandle.replace(/^@/, "") || null,
    facebookUrl: parsed.data.facebookUrl || null,
  }
  await db.insert(shopSettings).values({ id: "default", ...contacts })
    .onConflictDoUpdate({ target: shopSettings.id, set: { ...contacts, updatedAt: new Date() } })
  revalidateSettings(); return { ok: true }
}

/**
 * Brand identity — name, TH/EN description, and logo. Same single-fixed-
 * form shape as `saveShopContacts` above (not a list, so no dialog).
 * `logoUrl`/`logoStorageKey` arrive together, always describing the
 * CURRENT desired state (unchanged, replaced, or cleared to "" by the
 * caller) — never a partial update — so this action can tell a real
 * replacement from a no-op by diffing against the stored key and clean up
 * the old object in R2 exactly once.
 */
export async function saveBrandSettings(
  brandName: string,
  brandDescriptionTh: string,
  brandDescriptionEn: string,
  logoUrl: string,
  logoStorageKey: string
): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = z
    .object({
      brandName: z.string().trim().max(80),
      brandDescriptionTh: z.string().trim().max(300),
      brandDescriptionEn: z.string().trim().max(300),
      logoUrl: z.string().trim().max(500),
      logoStorageKey: z.string().trim().max(300),
    })
    .safeParse({ brandName, brandDescriptionTh, brandDescriptionEn, logoUrl, logoStorageKey })
  if (!parsed.success) return { ok: false, error: "invalid" }

  // A non-empty logoStorageKey must be a real brand-logo key — refuse to
  // persist anything else. Defense in depth alongside
  // /api/uploads/presign-logo's own validation: even if that endpoint were
  // ever weakened, this action never writes an arbitrary storage key into
  // the row that /api/images/[...key] and the storefront then trust.
  if (parsed.data.logoStorageKey && !isBrandLogoKey(parsed.data.logoStorageKey)) {
    return { ok: false, error: "invalid" }
  }

  const [existing] = await db
    .select({ logoStorageKey: shopSettings.logoStorageKey })
    .from(shopSettings)
    .where(eq(shopSettings.id, "default"))
    .limit(1)

  const brand = {
    brandName: parsed.data.brandName || null,
    brandDescriptionTh: parsed.data.brandDescriptionTh || null,
    brandDescriptionEn: parsed.data.brandDescriptionEn || null,
    logoUrl: parsed.data.logoUrl || null,
    logoStorageKey: parsed.data.logoStorageKey || null,
  }
  await db
    .insert(shopSettings)
    .values({ id: "default", ...brand })
    .onConflictDoUpdate({ target: shopSettings.id, set: { ...brand, updatedAt: new Date() } })

  // R2 cleanup for a replaced/removed logo — best-effort, runs after the
  // DB write has committed and must never fail/undo it (lib/r2.ts's
  // contract, same as updateProduct's image cleanup).
  const oldKey = existing?.logoStorageKey
  if (oldKey && oldKey !== brand.logoStorageKey) {
    deleteBrandLogoRenditions(oldKey).catch((error) => {
      console.error("Failed to delete old brand logo", oldKey, error)
    })
  }

  revalidateSettings()
  return { ok: true }
}

/**
 * Home-page hero carousel — the full ordered list of canonical
 * `brand/hero-...` keys (max MAX_HERO_IMAGES), always the CURRENT desired
 * state, like `saveBrandSettings`'s logo pair. Every key must match the hero
 * key shape (defense in depth alongside /api/uploads/presign-logo): the
 * storefront derives a public URL from each one. Photos dropped from the
 * list are deleted from storage best-effort, after the write commits.
 */
export async function saveHeroImages(keys: string[]): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = z
    .array(z.string().trim().max(300).refine(isHeroImageKey))
    .max(MAX_HERO_IMAGES)
    .refine((list) => new Set(list).size === list.length)
    .safeParse(keys)
  if (!parsed.success) return { ok: false, error: "invalid" }

  const [existing] = await db
    .select({ heroImageKeys: shopSettings.heroImageKeys })
    .from(shopSettings)
    .where(eq(shopSettings.id, "default"))
    .limit(1)

  await db
    .insert(shopSettings)
    .values({ id: "default", heroImageKeys: parsed.data })
    .onConflictDoUpdate({
      target: shopSettings.id,
      set: { heroImageKeys: parsed.data, updatedAt: new Date() },
    })

  const kept = new Set(parsed.data)
  for (const oldKey of existing?.heroImageKeys ?? []) {
    if (kept.has(oldKey)) continue
    deleteHeroImageRenditions(oldKey).catch((error) => {
      console.error("Failed to delete old hero image", oldKey, error)
    })
  }

  revalidateSettings()
  return { ok: true }
}

/**
 * Replaces the hand-picked Popular list. `orderedIds` IS the storefront
 * order (index 0 shows first); an empty list clears the section. The only
 * writer of `products.popularRank` — clear-then-renumber in one transaction
 * so a failed save can never leave two products on the same rank or a
 * half-applied order. `updatedAt` is left alone: this is merchandising, not
 * a product edit.
 */
export async function savePopularProducts(orderedIds: string[]): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = popularProductIdsSchema.safeParse(orderedIds)
  if (!parsed.success) return { ok: false, error: "invalid" }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ popularRank: null })
        .where(isNotNull(products.popularRank))
      for (const [index, productId] of parsed.data.entries()) {
        const [row] = await tx
          .update(products)
          .set({ popularRank: index })
          .where(eq(products.id, productId))
          .returning({ id: products.id })
        // A product deleted since the picker loaded — roll the whole save
        // back rather than store a list with a hole in it.
        if (!row) throw new Error("not_found")
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") {
      return { ok: false, error: "not_found" }
    }
    console.error("savePopularProducts failed", error)
    return { ok: false, error: "update_failed" }
  }

  revalidateSettings()
  return { ok: true }
}

export async function createCharacter(name: string, nameEn: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = z.object({ name: label, nameEn: z.string().trim().max(80) }).safeParse({ name, nameEn })
  if (!parsed.success) return { ok: false, error: "invalid" }
  const [last] = await db.select({ value: max(characters.sortOrder) }).from(characters)
  try {
    await db.insert(characters).values({ name: parsed.data.name, nameEn: parsed.data.nameEn || null, slug: slugify(parsed.data.name), sortOrder: (last?.value ?? -1) + 1 })
  } catch { return { ok: false, error: "duplicate" } }
  revalidateSettings(); return { ok: true }
}

/**
 * Restores the canonical character list (src/lib/character-seed.ts) from the
 * Settings page. `reset` also deletes characters outside that list — one still
 * attached to a product is reported back in `skipped` rather than deleted, so
 * the button can never quietly detach a character from live products. The
 * CLI's `--force` (which does drop those links) is deliberately not exposed
 * here.
 *
 * Re-checks isOwner() independently — the page being owner-gated is not the
 * boundary, this check is.
 */
export async function restoreDefaultCharacters(reset: boolean): Promise<SeedResult> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  try {
    const { deleted, skipped } = await seedCharacters({ reset })
    revalidateSettings()
    return { ok: true, deleted, skipped }
  } catch (error) {
    console.error("Failed to restore default characters", error)
    return { ok: false, error: "seed_failed" }
  }
}

export async function updateCharacter(characterId: string, name: string, nameEn: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = z.object({ id, name: label, nameEn: z.string().trim().max(80) }).safeParse({ id: characterId, name, nameEn })
  if (!parsed.success) return { ok: false, error: "invalid" }
  try {
    await db.update(characters).set({ name: parsed.data.name, nameEn: parsed.data.nameEn || null }).where(eq(characters.id, parsed.data.id))
  } catch { return { ok: false, error: "duplicate" } }
  revalidateSettings(); return { ok: true }
}

export async function deleteCharacter(characterId: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = id.safeParse(characterId)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const [used] = await db.select({ value: count() }).from(productCharacters).where(eq(productCharacters.characterId, parsed.data))
  if ((used?.value ?? 0) > 0) return { ok: false, error: "in_use" }
  await db.delete(characters).where(eq(characters.id, parsed.data)); revalidateSettings(); return { ok: true }
}

/* ------------------------------------------------------- colour palette */

/** A colour name as stored verbatim on productVariants.color. "-" is the
 * one-colour sentinel there, so it can never be a palette entry. */
const colorName = label.transform((value) => toEnglishColor(value)).refine((value) => value !== "-")

export async function createProductColor(name: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = colorName.safeParse(name)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const [last] = await db.select({ value: max(productColors.sortOrder) }).from(productColors)
  try {
    await db.insert(productColors).values({ name: parsed.data, sortOrder: (last?.value ?? -1) + 1 })
  } catch { return { ok: false, error: "duplicate" } }
  revalidateSettings(); return { ok: true }
}

/**
 * Renames a palette colour AND every product variant carrying the old name,
 * in one transaction — otherwise the products would silently drop out of the
 * palette. Order lines (`order_items.color`) are snapshots and are never
 * touched. A product that already has both names (e.g. "Gray" and "Grey")
 * would violate the variants' (product, colour, size) unique key; that
 * rolls the whole rename back and reports `duplicate`.
 */
export async function updateProductColor(colorId: string, name: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = z.object({ id, name: colorName }).safeParse({ id: colorId, name })
  if (!parsed.success) return { ok: false, error: "invalid" }
  let touchedProductIds: string[] = []
  try {
    touchedProductIds = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ name: productColors.name })
        .from(productColors)
        .where(eq(productColors.id, parsed.data.id))
      if (!current) throw new Error("not_found")
      if (current.name === parsed.data.name) return []
      await tx.update(productColors).set({ name: parsed.data.name }).where(eq(productColors.id, parsed.data.id))
      const renamed = await tx
        .update(productVariants)
        .set({ color: parsed.data.name, updatedAt: new Date() })
        .where(eq(productVariants.color, current.name))
        .returning({ productId: productVariants.productId })
      return Array.from(new Set(renamed.map((row) => row.productId)))
    })
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") return { ok: false, error: "not_found" }
    return { ok: false, error: "duplicate" }
  }
  revalidateSettings()
  // Each renamed product's own /shop/<code> page shows its colours too.
  if (touchedProductIds.length > 0) {
    const touched = await db
      .select({ productCode: products.productCode })
      .from(products)
      .where(inArray(products.id, touchedProductIds))
    for (const row of touched) revalidateStorefront(row.productCode)
  }
  return { ok: true }
}

/** Removes a colour from the palette only — products keep the colour text. */
export async function deleteProductColor(colorId: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = id.safeParse(colorId)
  if (!parsed.success) return { ok: false, error: "invalid" }
  await db.delete(productColors).where(eq(productColors.id, parsed.data))
  revalidateSettings(); return { ok: true }
}

export async function reorderProductColors(orderedIds: string[]): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = z.array(id).max(500).safeParse(orderedIds)
  if (!parsed.success) return { ok: false, error: "invalid" }
  await db.transaction(async (tx) => {
    for (const [sortOrder, colorId] of parsed.data.entries()) {
      await tx.update(productColors).set({ sortOrder }).where(eq(productColors.id, colorId))
    }
  })
  revalidateSettings(); return { ok: true }
}

export async function saveOrderLabel(kind: "admin" | "customer", key: string, labelTh: string, labelEn: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsedLabels = z.object({ th: label, en: label }).safeParse({ th: labelTh, en: labelEn })
  if (!parsedLabels.success) return { ok: false, error: "invalid" }
  if (kind === "admin") {
    const parsedKey = z.enum(orderStatus.enumValues).safeParse(key)
    if (!parsedKey.success) return { ok: false, error: "invalid" }
    await db.insert(orderStatusLabels).values({ status: parsedKey.data, labelTh: parsedLabels.data.th, labelEn: parsedLabels.data.en })
      .onConflictDoUpdate({ target: orderStatusLabels.status, set: { labelTh: parsedLabels.data.th, labelEn: parsedLabels.data.en } })
  } else {
    const parsedKey = z.enum(customerOrderStage.enumValues).safeParse(key)
    if (!parsedKey.success) return { ok: false, error: "invalid" }
    await db.insert(customerStatusLabels).values({ stage: parsedKey.data, labelTh: parsedLabels.data.th, labelEn: parsedLabels.data.en })
      .onConflictDoUpdate({ target: customerStatusLabels.stage, set: { labelTh: parsedLabels.data.th, labelEn: parsedLabels.data.en } })
  }
  revalidateSettings(); return { ok: true }
}

const itemStatusSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_]+$/).max(80),
  labelTh: label,
  labelEn: label,
  isReceived: z.boolean(),
  isRefunded: z.boolean(),
  /** Reveals the order's Preorder shipments panel (1688, Taobao, …). */
  isPreorder: z.boolean().default(false),
  isActive: z.boolean(),
})

export async function saveItemStatus(values: z.input<typeof itemStatusSchema>, originalCode?: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = itemStatusSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  if (originalCode) {
    await db.update(orderItemStatuses).set({ labelTh: parsed.data.labelTh, labelEn: parsed.data.labelEn, isReceived: parsed.data.isReceived, isRefunded: parsed.data.isRefunded, isPreorder: parsed.data.isPreorder, isActive: parsed.data.isActive }).where(eq(orderItemStatuses.code, originalCode))
  } else {
    const [last] = await db.select({ value: max(orderItemStatuses.sortOrder) }).from(orderItemStatuses)
    try { await db.insert(orderItemStatuses).values({ ...parsed.data, sortOrder: (last?.value ?? -1) + 1 }) }
    catch { return { ok: false, error: "duplicate" } }
  }
  revalidateSettings(); return { ok: true }
}

export async function makeDefaultItemStatus(code: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const [existing] = await db.select({ code: orderItemStatuses.code }).from(orderItemStatuses).where(eq(orderItemStatuses.code, code)).limit(1)
  if (!existing) return { ok: false, error: "invalid" }
  await db.transaction(async (tx) => {
    await tx.update(orderItemStatuses).set({ isDefault: false })
    await tx.update(orderItemStatuses).set({ isDefault: true, isActive: true }).where(eq(orderItemStatuses.code, code))
  })
  revalidateSettings(); return { ok: true }
}

export async function deleteItemStatus(code: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const [status] = await db.select().from(orderItemStatuses).where(eq(orderItemStatuses.code, code)).limit(1)
  if (!status || status.isDefault) return { ok: false, error: "protected" }
  const [used] = await db.select({ value: count() }).from(orderItems).where(eq(orderItems.statusCode, code))
  if ((used?.value ?? 0) > 0) return { ok: false, error: "in_use" }
  await db.delete(orderItemStatuses).where(eq(orderItemStatuses.code, code)); revalidateSettings(); return { ok: true }
}

/**
 * Shop-wide % sale (Settings -> Discount). Every product's effective price
 * derives from this row (src/db/queries/pricing.ts), so the whole storefront
 * is revalidated. Dates arrive as Bangkok `datetime-local` text.
 */
export async function saveShopSale(input: ShopSaleInput): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = shopSaleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" }
  const sale = {
    saleEnabled: parsed.data.enabled,
    salePercent: parsed.data.percent == null ? null : String(parsed.data.percent),
    saleStartsAt: parsed.data.startsAt,
    saleEndsAt: parsed.data.endsAt,
    saleLabelTh: parsed.data.labelTh || null,
    saleLabelEn: parsed.data.labelEn || null,
  }
  await db.insert(shopSettings).values({ id: "default", ...sale })
    .onConflictDoUpdate({ target: shopSettings.id, set: { ...sale, updatedAt: new Date() } })
  revalidateSettings()
  return { ok: true }
}
