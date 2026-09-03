"use server"

import { eq } from "drizzle-orm"
import { z } from "zod"

import { db, txDb } from "@/db"
import { products, productVariants } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth-helpers"
import { learnProductType } from "@/lib/reference"
import { isOwner } from "@/lib/roles"
import { productImportRowSchema } from "@/lib/validations/product"

import { revalidateStorefront } from "../revalidate"

/**
 * `updateExisting` is NOT part of `productImportRowSchema` (src/lib/
 * validations/product.ts — out of scope for this feature, not touched).
 * It is composed on top of that schema here, at the action layer, so the
 * shared schema stays generic and this import-specific "what to do with a
 * duplicate row" flag lives only where it's used. Per plan Risk 7: the
 * owner ticks update-or-skip per duplicate row in the preview UI rather
 * than the importer silently upserting — defaults to `false` (skip) so an
 * un-reviewed duplicate row can never silently overwrite existing data.
 */
const importRowSchema = productImportRowSchema.extend({
  updateExisting: z.boolean().default(false),
})
export type ImportRowValues = z.input<typeof importRowSchema>

const importRowsSchema = z.array(importRowSchema).min(1, "required").max(1000, "max")

export type ImportResult =
  | { ok: true; created: number; updated: number }
  | { ok: false; error: string }

function toNullable(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed.length ? trimmed : null
}

function toMoney(value: number): string {
  return value.toFixed(2)
}

/**
 * Inserts (and, for rows the owner explicitly opted into, updates) the
 * rows confirmed in the import preview. Product + variants land together
 * per row inside one transaction spanning the whole batch — plan Risk 3 —
 * so a mid-batch failure never leaves an orphaned partial import.
 */
export async function importProducts(rows: ImportRowValues[]): Promise<ImportResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = importRowsSchema.safeParse(rows)
  if (!parsed.success) return { ok: false, error: "invalid" }

  let created = 0
  let updated = 0

  try {
    await txDb().transaction(async (tx) => {
      // One bulk fetch rather than one query per row (getProductCodes()'s
      // "fetch everything" precedent in db/queries/products.ts) — a
      // boutique shop's catalogue is small enough that this is cheap, and
      // it avoids N sequential existence checks inside the loop below.
      const existingRows = await tx
        .select({ id: products.id, productCode: products.productCode })
        .from(products)
      const existingByCode = new Map(
        existingRows.map((row) => [row.productCode.toLowerCase(), row.id])
      )

      for (const row of parsed.data) {
        const existingId = existingByCode.get(row.productCode.toLowerCase())

        if (existingId) {
          if (!row.updateExisting) continue // skip, per the owner's per-row choice

          await tx
            .update(products)
            .set({
              productName: row.productName || row.productCode,
              productType: toNullable(row.productType),
              sellPrice: toMoney(row.sellPrice),
              originalPrice: toMoney(row.originalPrice),
              buyingSource: toNullable(row.buyingSource),
              sourceLink: toNullable(row.sourceLink),
              updatedAt: new Date(),
            })
            .where(eq(products.id, existingId))

          // Import rows replace the variant matrix wholesale rather than
          // merging — the preview shows the full picture the owner
          // confirmed, so a simple delete + reinsert (no id-preserving
          // upsert) keeps this path simple and matches "what's on screen
          // is what gets written."
          await tx.delete(productVariants).where(eq(productVariants.productId, existingId))
          if (row.variants.length > 0) {
            await tx.insert(productVariants).values(
              row.variants.map((variant, i) => ({
                productId: existingId,
                color: variant.color,
                size: variant.size,
                quantity: variant.quantity,
                sku: toNullable(variant.sku),
                sortOrder: i,
              }))
            )
          }
          updated += 1
          continue
        }

        const [inserted] = await tx
          .insert(products)
          .values({
            productCode: row.productCode,
            productName: row.productName || row.productCode,
            productType: toNullable(row.productType),
            sellPrice: toMoney(row.sellPrice),
            originalPrice: toMoney(row.originalPrice),
            buyingSource: toNullable(row.buyingSource),
            sourceLink: toNullable(row.sourceLink),
            status: "active",
            createdBy: user.id,
          })
          .returning({ id: products.id })
        if (!inserted) throw new Error("insert_failed")

        if (row.variants.length > 0) {
          await tx.insert(productVariants).values(
            row.variants.map((variant, i) => ({
              productId: inserted.id,
              color: variant.color,
              size: variant.size,
              quantity: variant.quantity,
              sku: toNullable(variant.sku),
              sortOrder: i,
            }))
          )
        }
        created += 1
      }
    })
  } catch (error) {
    console.error("importProducts failed", error)
    return { ok: false, error: "import_failed" }
  }

  // Fold newly seen product types into the reference list — deduplicated
  // so a 200-row import of the same type doesn't issue 200 lookups.
  const seenTypes = new Set<string>()
  for (const row of parsed.data) {
    const type = row.productType?.trim()
    if (!type || seenTypes.has(type)) continue
    seenTypes.add(type)
    await learnProductType(db, type)
  }

  revalidateStorefront()
  return { ok: true, created, updated }
}
