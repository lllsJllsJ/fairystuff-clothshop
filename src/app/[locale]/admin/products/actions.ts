"use server"

import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/db"
import { productImages, products, productVariants } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth-helpers"
import { deleteProductImageRenditions } from "@/lib/r2"
import {
  nextProductCode,
  nextProductCodeIn,
} from "@/lib/product-code"
import { learnProductType } from "@/lib/reference"
import { isOwner } from "@/lib/roles"
import {
  productFormSchema,
  productInlineUpdateSchema,
  type ProductFormValues,
  type ProductImageInput,
  type ProductInlineUpdateValues,
} from "@/lib/validations/product"

import { revalidateStorefront } from "./revalidate"

/**
 * Exact 5-step shape from carstockpro's `src/app/(app)/cars/actions.ts`:
 * auth -> role check -> zod parse -> write -> revalidatePath. Same
 * `ActionResult` discriminated union and terse error strings.
 *
 * ---------------------------------------------------------------------
 * SECURITY — plan Risk 1, restated at every call site on purpose
 * ---------------------------------------------------------------------
 * There is no RLS in this stack. Every action below independently
 * re-checks `isOwner(user.role)` even though the proxy and the admin
 * layout's `requireOwner()` already gate the page/route that calls it —
 * never assume either of those already covered it. A missing check here
 * is a full breach with no backstop.
 *
 * ---------------------------------------------------------------------
 * TRANSACTIONS — plan Risk 3
 * ---------------------------------------------------------------------
 * `products` + `productVariants` + `productImages` must land atomically,
 * so `createProduct` and `updateProduct` open a transaction. Both now call
 * `db.transaction(...)` directly — they used `txDb()`, the deprecated alias
 * kept from the old Neon HTTP driver that could not do interactive
 * transactions, and were migrated while the code generator was added (the
 * pooled node-postgres driver supports them on `db` itself).
 * Single-statement writes
 * (`updateProductInline`, `deleteProduct`) use plain
 * `db` instead — `deleteProduct` relies on the FK `onDelete: "cascade"`
 * declared in schema.ts to remove variants/images in the same statement,
 * so it never needs a manual multi-table transaction.
 *
 * ---------------------------------------------------------------------
 * GENERATED COLUMNS — never write these
 * ---------------------------------------------------------------------
 * `products.margin` is `GENERATED ALWAYS AS (...) STORED` (added by
 * drizzle/0000_init_extras.sql, not modeled in schema.ts's column
 * builders). Postgres rejects an insert/update that names it (23P05).
 * None of the writes below ever set it.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

/** Postgres unique_violation — raised here by the `lower(product_code)`
 * unique index when two products share a code case-insensitively. */
const UNIQUE_VIOLATION = "23505"

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  )
}

function toNullable(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed.length ? trimmed : null
}

/** `numeric(12,2)` columns take a string driver value (drizzle-orm's
 * default `numeric` mode) — see src/db/schema.ts's file-level comment.
 * Money fields are always defined post-parse (the `money` preprocessor in
 * validations/product.ts collapses "" to 0), so this never sees NaN. */
function toMoney(value: number): string {
  return value.toFixed(2)
}

/** Code prefix for a product saved with no type at all. */
const UNTYPED_CODE_PREFIX = "GEN"
/** How many times a create re-mints its code after losing a race. */
const CODE_ATTEMPTS = 5

/** `TS-007` + 2 -> `TS-009`; leaves an unparseable code untouched. */
function bumpCode(code: string, by: number): string {
  const match = code.match(/^(.*-)(\d+)$/)
  if (!match) return code
  const width = match[2].length
  return `${match[1]}${String(Number(match[2]) + by).padStart(width, "0")}`
}

/**
 * Runs a create, retrying only the `lower(product_code)` unique violation —
 * the one failure a generated code can hit when two creates read the same
 * highest number at once. Any other error propagates on the first attempt.
 */
async function withCodeRetry<T>(
  run: (attempt: number) => Promise<T>
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    try {
      return await run(attempt)
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      lastError = error
    }
  }
  throw lastError
}

export async function createProduct(
  values: ProductFormValues,
  images: ProductImageInput[],
  productId?: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = productFormSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const v = parsed.data

  // The product code is GENERATED, never taken from the client — see
  // lib/product-code.ts. `v.productCode` holds whatever preview the form
  // was showing and is deliberately ignored.
  let insertedId: string
  let assignedCode = ""
  try {
    insertedId = await withCodeRetry(async (attempt) => db.transaction(async (tx) => {
      assignedCode =
        (await nextProductCodeIn(tx, v.productType)) ??
        `${UNTYPED_CODE_PREFIX}-${Date.now().toString().slice(-6)}`
      if (attempt > 0) {
        // A concurrent create took the number we just read; nudge past it
        // rather than replaying the identical code.
        assignedCode = bumpCode(assignedCode, attempt)
      }

      const [row] = await tx
        .insert(products)
        .values({
          ...(productId ? { id: productId } : {}),
          productCode: assignedCode,
          productName: v.productName,
          productType: toNullable(v.productType),
          description: toNullable(v.description),
          sellPrice: toMoney(v.sellPrice),
          originalPrice: toMoney(v.originalPrice),
          buyingSource: toNullable(v.buyingSource),
          sourceLink: toNullable(v.sourceLink),
          status: v.status,
          createdBy: user.id,
        })
        .returning({ id: products.id })

      if (!row) throw new Error("insert_failed")

      if (v.variants.length > 0) {
        await tx.insert(productVariants).values(
          v.variants.map((variant, i) => ({
            productId: row.id,
            color: variant.color,
            size: variant.size,
            quantity: variant.quantity,
            sku: toNullable(variant.sku),
            sortOrder: i,
          }))
        )
      }

      if (images.length > 0) {
        await tx.insert(productImages).values(
          images.map((img) => ({
            productId: row.id,
            url: img.url,
            storageKey: img.storageKey,
            alt: toNullable(img.alt),
            color: toNullable(img.color),
            sortOrder: img.sortOrder,
          }))
        )
      }

      return row.id
    }))
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate_code" }
    console.error("createProduct failed", error)
    return { ok: false, error: "insert_failed" }
  }

  // Best-effort — never fails the product write above (lib/reference.ts).
  await learnProductType(db, v.productType)
  revalidateStorefront(assignedCode)
  return { ok: true, id: insertedId }
}

/**
 * The code the form should show for a type the owner just picked. A
 * PREVIEW only: `createProduct` mints the real code inside its own
 * transaction, so a code shown here and taken by another create in the
 * meantime simply becomes the next number on save.
 */
export async function previewProductCode(
  productType: string
): Promise<{ ok: true; code: string | null } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  try {
    return { ok: true, code: await nextProductCode(productType) }
  } catch (error) {
    console.error("previewProductCode failed", error)
    return { ok: false, error: "preview_failed" }
  }
}

export async function updateProduct(
  id: string,
  values: ProductFormValues,
  newImages: ProductImageInput[] = [],
  removedImageIds: string[] = [],
  /** New sortOrder for existing images (index 0 = cover photo). */
  imageOrder: { id: string; sortOrder: number }[] = []
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = productFormSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const v = parsed.data

  // Fetch storage keys for removed images BEFORE the transaction deletes
  // their rows — deleteProductImage (R2 cleanup) runs after commit and is
  // best-effort, so it must not depend on rows the transaction already
  // removed.
  const removedKeys =
    removedImageIds.length > 0
      ? (
          await db
            .select({ storageKey: productImages.storageKey })
            .from(productImages)
            .where(inArray(productImages.id, removedImageIds))
        )
          .map((row) => row.storageKey)
          .filter((key): key is string => !!key)
      : []

  // Filled in from the row itself — the code is never client-supplied.
  let savedCode = ""

  try {
    await db.transaction(async (tx) => {
      const [updatedRow] = await tx
        .update(products)
        .set({
          // productCode is deliberately absent: codes are generated once
          // at create and never change, even when the type does (see
          // lib/product-code.ts). The storefront URL and every order-line
          // snapshot depend on it staying put.
          productName: v.productName,
          productType: toNullable(v.productType),
          description: toNullable(v.description),
          sellPrice: toMoney(v.sellPrice),
          originalPrice: toMoney(v.originalPrice),
          buyingSource: toNullable(v.buyingSource),
          sourceLink: toNullable(v.sourceLink),
          status: v.status,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning({ id: products.id, productCode: products.productCode })

      if (!updatedRow) throw new Error("not_found")
      savedCode = updatedRow.productCode

      // Replace-semantics for variants: delete rows dropped from the
      // payload, then update-by-id the ones kept and insert the new ones.
      // Existing rows are updated by id (not re-inserted) so we never hit
      // the primary-key conflict a naive "insert ... on conflict(color,
      // size)" would raise for a row whose id already exists but whose
      // (color, size) is unchanged.
      const incomingIds = new Set(
        v.variants.map((variant) => variant.id).filter((vid): vid is string => !!vid)
      )
      const existingVariants = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.productId, id))
      const staleIds = existingVariants
        .map((row) => row.id)
        .filter((rowId) => !incomingIds.has(rowId))
      if (staleIds.length > 0) {
        await tx.delete(productVariants).where(inArray(productVariants.id, staleIds))
      }

      for (const [i, variant] of v.variants.entries()) {
        if (variant.id) {
          await tx
            .update(productVariants)
            .set({
              color: variant.color,
              size: variant.size,
              quantity: variant.quantity,
              sku: toNullable(variant.sku),
              sortOrder: i,
              updatedAt: new Date(),
            })
            .where(and(eq(productVariants.id, variant.id), eq(productVariants.productId, id)))
        } else {
          // A brand-new row (no id yet) — upsert on the real uniqueness
          // constraint in case the same (color, size) briefly reappears
          // (e.g. a row was renamed away and a new one typed back in).
          await tx
            .insert(productVariants)
            .values({
              productId: id,
              color: variant.color,
              size: variant.size,
              quantity: variant.quantity,
              sku: toNullable(variant.sku),
              sortOrder: i,
            })
            .onConflictDoUpdate({
              target: [productVariants.productId, productVariants.color, productVariants.size],
              set: {
                quantity: variant.quantity,
                sku: toNullable(variant.sku),
                sortOrder: i,
                updatedAt: new Date(),
              },
            })
        }
      }

      if (removedImageIds.length > 0) {
        await tx.delete(productImages).where(inArray(productImages.id, removedImageIds))
      }

      if (newImages.length > 0) {
        await tx.insert(productImages).values(
          newImages.map((img) => ({
            productId: id,
            url: img.url,
            storageKey: img.storageKey,
            alt: toNullable(img.alt),
            color: toNullable(img.color),
            sortOrder: img.sortOrder,
          }))
        )
      }

      for (const { id: imageId, sortOrder } of imageOrder) {
        await tx
          .update(productImages)
          .set({ sortOrder })
          .where(and(eq(productImages.id, imageId), eq(productImages.productId, id)))
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate_code" }
    if (error instanceof Error && error.message === "not_found") {
      return { ok: false, error: "not_found" }
    }
    console.error("updateProduct failed", error)
    return { ok: false, error: "update_failed" }
  }

  // R2 cleanup for removed images — best-effort, runs after the DB write
  // has committed and must never fail/undo it (lib/r2.ts's contract).
  await Promise.all(
    removedKeys.map((key) =>
      deleteProductImageRenditions(key).catch((error) => {
        console.error("Failed to delete R2 object", key, error)
      })
    )
  )

  await learnProductType(db, v.productType)
  revalidateStorefront(savedCode)
  return { ok: true, id }
}

/** Saves one row of the admin product table — the quick fields only. The
 * full form still owns images, description, source fields, and variants. */
export async function updateProductInline(
  id: string,
  values: ProductInlineUpdateValues
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = productInlineUpdateSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const v = parsed.data

  try {
    const [row] = await db
      .update(products)
      .set({
        // No productCode here either — the inline table editor shows it
        // read-only for the same reason the form does.
        productName: v.productName,
        productType: toNullable(v.productType),
        sellPrice: toMoney(v.sellPrice),
        originalPrice: toMoney(v.originalPrice),
        status: v.status,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning({ productCode: products.productCode })

    if (!row) return { ok: false, error: "not_found" }

    await learnProductType(db, v.productType)
    revalidateStorefront(row.productCode)
    return { ok: true, id }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate_code" }
    console.error("updateProductInline failed", error)
    return { ok: false, error: "update_failed" }
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const [row] = await db
    .select({ productCode: products.productCode })
    .from(products)
    .where(eq(products.id, id))
    .limit(1)
  if (!row) return { ok: false, error: "not_found" }

  const images = await db
    .select({ storageKey: productImages.storageKey })
    .from(productImages)
    .where(eq(productImages.productId, id))

  // A single statement — the FK `onDelete: "cascade"` on productVariants
  // and productImages (schema.ts) removes both in the same delete, so this
  // never needs txDb()'s multi-statement transaction.
  await db.delete(products).where(eq(products.id, id))

  // Best-effort R2 cleanup — never blocks the response on a storage error.
  await Promise.all(
    images
      .map((img) => img.storageKey)
      .filter((key): key is string => !!key)
      .map((key) =>
        deleteProductImageRenditions(key).catch((error) => {
          console.error("Failed to delete R2 object", key, error)
        })
      )
  )

  revalidateStorefront(row.productCode)
  return { ok: true, id }
}
