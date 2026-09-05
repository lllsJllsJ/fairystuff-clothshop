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
import { revalidateSettings } from "./revalidate"

type Result = { ok: true } | { ok: false; error: string }
const label = z.string().trim().min(1).max(80)
const id = z.uuid()

async function owner(): Promise<boolean> {
  const user = await getCurrentUser()
  return !!user && isOwner(user.role)
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-").replace(/^-+|-+$/g, "") || `character-${Date.now()}`
}

export async function saveShopContacts(lineId: string, instagramHandle: string): Promise<Result> {
  if (!(await owner())) return { ok: false, error: "forbidden" }
  const parsed = z.object({ lineId: z.string().trim().max(100), instagramHandle: z.string().trim().max(100) }).safeParse({ lineId, instagramHandle })
  if (!parsed.success) return { ok: false, error: "invalid" }
  await db.insert(shopSettings).values({ id: "default", lineId: parsed.data.lineId || null, instagramHandle: parsed.data.instagramHandle.replace(/^@/, "") || null })
    .onConflictDoUpdate({ target: shopSettings.id, set: { lineId: parsed.data.lineId || null, instagramHandle: parsed.data.instagramHandle.replace(/^@/, "") || null, updatedAt: new Date() } })
  revalidateSettings(); return { ok: true }
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
