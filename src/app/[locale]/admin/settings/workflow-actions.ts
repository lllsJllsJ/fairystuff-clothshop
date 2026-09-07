"use server"

import { count, eq, max } from "drizzle-orm"
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
  shopSettings,
} from "@/db/schema"
import { getCurrentUser } from "@/lib/auth-helpers"
import { isOwner } from "@/lib/roles"
import { isValidFacebookUrl, normalizeFacebookUrl } from "@/lib/facebook"
import { seedCharacters } from "@/lib/character-seed"
import { isBrandLogoKey } from "@/lib/brand-image-keys"
import { deleteBrandLogoRenditions } from "@/lib/r2"
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
  isActive: z.boolean(),
})

export async function saveItemStatus(values: z.input<typeof itemStatusSchema>, originalCode?: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = itemStatusSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  if (originalCode) {
    await db.update(orderItemStatuses).set({ labelTh: parsed.data.labelTh, labelEn: parsed.data.labelEn, isReceived: parsed.data.isReceived, isRefunded: parsed.data.isRefunded, isActive: parsed.data.isActive }).where(eq(orderItemStatuses.code, originalCode))
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
