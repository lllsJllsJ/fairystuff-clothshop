"use server"

import { count, eq, max } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { productTypes, products } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth-helpers"
import { isOwner } from "@/lib/roles"

import { CLEAR_CONFIRMATION } from "@/lib/data-confirm"
import { derivePrefix } from "@/lib/product-code"
import { clearAllData } from "@/lib/shop-data"

import { revalidateOrders } from "../orders/revalidate"
import { revalidateSettings } from "./revalidate"

/**
 * `getProductTypes()` (src/db/queries/product-types.ts) is read-only per
 * this phase's brief — the create/rename/delete/reorder mutations below
 * are this file's own responsibility. Same 5-step shape as
 * `admin/products/actions.ts` / `admin/orders/actions.ts`: auth -> role
 * check -> zod parse -> write -> revalidate.
 *
 * ---------------------------------------------------------------------
 * SECURITY — plan Risk 1, restated at every call site on purpose
 * ---------------------------------------------------------------------
 * No RLS. Every action re-checks `isOwner(user.role)` independently, even
 * though the proxy and `requireOwner()` already gate the page that calls
 * it — never assume either already covered it.
 *
 * ---------------------------------------------------------------------
 * ORPHANED PRODUCTS — `products.productType` is free text, not an FK
 * ---------------------------------------------------------------------
 * `deleteProductType` BLOCKS the delete outright when any product still
 * carries that type's name (returns the count so the UI can show exactly
 * what's in the way), rather than deleting silently and leaving those
 * products pointing at a name that no longer exists in the managed list.
 * `renameProductType` goes one step further: it cascades the new name onto
 * every product currently using the old one, inside the same transaction,
 * so a rename can never create the same orphaning problem on its own.
 *
 * ---------------------------------------------------------------------
 * TRANSACTIONS — plan Risk 3
 * ---------------------------------------------------------------------
 * `renameProductType` (types row + product cascade) and
 * `reorderProductTypes` (N row updates) are both multi-statement, so both
 * open a transaction, calling `db.transaction(...)` directly. They used
 * `txDb()`, a deprecated alias for `db` retained from
 * the old Neon HTTP driver, which could not do interactive transactions; the
 * pooled node-postgres driver can, so `db.transaction(...)` is equivalent and
 * preferred in new code. `createProductType` and the count-then-delete
 * in `deleteProductType` are single-statement (or read-then-single-write),
 * so they use plain `db`.
 */

/**
 * The key this type's product codes are built from — `TS` -> `TS-001`.
 * Uppercased and stripped to A-Z/0-9 so a code never carries a space or a
 * Thai character (see src/lib/product-code.ts). Left blank, one is derived
 * from the English name, then the slug.
 */
const codePrefixSchema = z
  .string()
  .trim()
  .max(6)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }
export type DeleteTypeResult =
  | { ok: true }
  | { ok: false; error: "in_use"; count: number }
  | { ok: false; error: string }

const UNIQUE_VIOLATION = "23505"

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  )
}

const nameSchema = z.string().trim().min(1, "required").max(60)
/** Always parsed against `nameEn ?? ""` at the call site, so the schema
 * itself never needs to accept `undefined` — empty string is the "not
 * set" value throughout this file, matching `toNullable`'s contract. */
const nameEnSchema = z.string().trim().max(60)

function toNullable(value: string): string | null {
  return value.length ? value : null
}

/** Best-effort slug for a product type name — mirrors lib/reference.ts's
 * private `slugify` (kept local here since that function isn't exported
 * and this file doesn't own lib/reference.ts). Preserves Thai characters
 * alongside ASCII since most type names are Thai. */
function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || `type-${Date.now()}`
}

export async function createProductType(
  name: string,
  nameEn?: string,
  codePrefix?: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return { ok: false, error: "invalid" }
  const parsedNameEn = nameEnSchema.safeParse(nameEn ?? "")
  if (!parsedNameEn.success) return { ok: false, error: "invalid" }
  const parsedPrefix = codePrefixSchema.safeParse(codePrefix ?? "")
  if (!parsedPrefix.success) return { ok: false, error: "invalid" }

  try {
    const [{ value: currentMax }] = await db
      .select({ value: max(productTypes.sortOrder) })
      .from(productTypes)
    const nextSortOrder = (currentMax ?? -1) + 1

    const [row] = await db
      .insert(productTypes)
      .values({
        name: parsedName.data,
        nameEn: toNullable(parsedNameEn.data),
        slug: slugify(parsedName.data),
        codePrefix:
          parsedPrefix.data ||
          derivePrefix(
            parsedNameEn.data || null,
            slugify(parsedName.data),
            parsedName.data,
            await claimedPrefixes()
          ),
        sortOrder: nextSortOrder,
      })
      .returning({ id: productTypes.id })

    if (!row) return { ok: false, error: "insert_failed" }

    revalidateSettings()
    return { ok: true, id: row.id }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate_type" }
    console.error("createProductType failed", error)
    return { ok: false, error: "insert_failed" }
  }
}

export async function renameProductType(
  id: string,
  name: string,
  nameEn?: string,
  codePrefix?: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return { ok: false, error: "invalid" }
  const parsedNameEn = nameEnSchema.safeParse(nameEn ?? "")
  if (!parsedNameEn.success) return { ok: false, error: "invalid" }
  const parsedPrefix = codePrefixSchema.safeParse(codePrefix ?? "")
  if (!parsedPrefix.success) return { ok: false, error: "invalid" }

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ name: productTypes.name })
        .from(productTypes)
        .where(eq(productTypes.id, id))
        .limit(1)
      if (!existing) throw new Error("not_found")

      await tx
        .update(productTypes)
        .set({
          name: parsedName.data,
          nameEn: toNullable(parsedNameEn.data),
          // Blank leaves the existing prefix alone: codes already minted
          // from it stay meaningful, and clearing it would only make the
          // next code derive a different one.
          ...(parsedPrefix.data ? { codePrefix: parsedPrefix.data } : {}),
        })
        .where(eq(productTypes.id, id))

      // Cascade the rename onto every product currently using the old
      // name — see the file header. Only fires when the name actually
      // changed (a nameEn-only edit shouldn't touch the products table).
      if (existing.name !== parsedName.data) {
        await tx
          .update(products)
          .set({ productType: parsedName.data, updatedAt: new Date() })
          .where(eq(products.productType, existing.name))
      }
    })

    revalidateSettings()
    return { ok: true, id }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate_type" }
    if (error instanceof Error && error.message === "not_found") {
      return { ok: false, error: "not_found" }
    }
    console.error("renameProductType failed", error)
    return { ok: false, error: "update_failed" }
  }
}

/** Prefixes already spoken for, so a derived one never collides. */
async function claimedPrefixes(): Promise<Set<string>> {
  const rows = await db
    .select({ codePrefix: productTypes.codePrefix })
    .from(productTypes)
  return new Set(
    rows.map((row) => (row.codePrefix ?? "").toUpperCase()).filter(Boolean)
  )
}

export async function deleteProductType(id: string): Promise<DeleteTypeResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const [row] = await db
    .select({ name: productTypes.name })
    .from(productTypes)
    .where(eq(productTypes.id, id))
    .limit(1)
  if (!row) return { ok: false, error: "not_found" }

  const [{ value: inUseCount }] = await db
    .select({ value: count() })
    .from(products)
    .where(eq(products.productType, row.name))

  if (inUseCount > 0) {
    return { ok: false, error: "in_use", count: inUseCount }
  }

  await db.delete(productTypes).where(eq(productTypes.id, id))
  revalidateSettings()
  return { ok: true }
}

export async function reorderProductTypes(orderedIds: string[]): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = z.array(z.uuid()).min(1).safeParse(orderedIds)
  if (!parsed.success) return { ok: false, error: "invalid" }

  try {
    await db.transaction(async (tx) => {
      for (const [index, typeId] of parsed.data.entries()) {
        await tx
          .update(productTypes)
          .set({ sortOrder: index })
          .where(eq(productTypes.id, typeId))
      }
    })
  } catch (error) {
    console.error("reorderProductTypes failed", error)
    return { ok: false, error: "update_failed" }
  }

  revalidateSettings()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Shop data tool — clear
// ---------------------------------------------------------------------------

/**
 * DESTRUCTIVE, and available in production, so the gates are stacked:
 *
 *   1. `getCurrentUser()` + `isOwner()`, independently re-checked here as
 *      every action in this codebase must (no RLS, no backstop).
 *   2. A typed confirmation phrase the caller must send verbatim. The UI
 *      makes the owner type it; a stray `fetch` of this action without it
 *      does nothing. The two operations use DIFFERENT phrases on purpose —
 *      muscle memory from one must not fire the other.
 *
 * There is no undo and no application-level backup: recovery means a
 * Railway Postgres backup/PITR restore, and the storage objects deleted
 * alongside are gone for good. Keep the confirmation.
 *
 * The phrase lives in `lib/data-confirm.ts` — a `"use server"`
 * module may only export async functions, so they cannot be declared here.
 */
export type DataToolResult = { ok: true } | { ok: false; error: string }

async function requireOwnerFor(
  confirmation: string,
  expected: string
): Promise<{ ok: false; error: string } | null> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }
  if (confirmation !== expected) return { ok: false, error: "confirm_mismatch" }
  return null
}

/**
 * Empties products, variants, images, orders, and line items — and the
 * stored image objects behind them. Keeps the owner account and the
 * product-type list.
 */
export async function clearShopData(confirmation: string): Promise<DataToolResult> {
  const denied = await requireOwnerFor(confirmation, CLEAR_CONFIRMATION)
  if (denied) return denied

  try {
    await clearAllData()
  } catch (error) {
    console.error("clearShopData failed", error)
    return { ok: false, error: "clear_failed" }
  }

  revalidateSettings()
  revalidateOrders()
  return { ok: true }
}
