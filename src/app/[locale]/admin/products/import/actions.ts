"use server"

import { db } from "@/db"
import { getCurrentUser } from "@/lib/auth-helpers"
import { importProductRow, type ImportRowResult } from "@/lib/import/import-product"
import { learnProductType } from "@/lib/reference"
import { isOwner } from "@/lib/roles"
import {
  productImportChunkSchema,
  type ProductImportRow,
} from "@/lib/validations/product"

import { revalidateStorefront } from "../revalidate"

export type ImportChunkResult =
  | { ok: true; results: ImportRowResult[] }
  | { ok: false; error: string }

/**
 * Imports one small chunk of preview rows (IMPORT_CHUNK_SIZE). The client
 * calls this repeatedly so a big sheet shows progress and no single
 * request runs long while images download. Each row is its own
 * transaction (see lib/import/import-product.ts) and its result is
 * reported individually — nothing fails the whole batch.
 *
 * Duplicate codes WITHIN the file are dropped by the client before
 * sending (first occurrence wins); this action re-guards within a chunk.
 * Whether a row creates or updates is decided HERE from the database, not
 * from the client's preview label.
 */
export async function importProductsChunk(rows: ProductImportRow[]): Promise<ImportChunkResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = productImportChunkSchema.safeParse(rows)
  if (!parsed.success) return { ok: false, error: "invalid" }

  const results: ImportRowResult[] = []
  const seenCodes = new Set<string>()
  for (const row of parsed.data) {
    const code = row.productCode.toLowerCase()
    if (code && seenCodes.has(code)) {
      results.push({ sourceRow: row.sourceRow, ok: false, error: "duplicate_in_file" })
      continue
    }
    if (code) seenCodes.add(code)

    const result = await importProductRow(row, user.id)
    results.push(result)
    if (result.ok) {
      await learnProductType(db, row.productType)
      revalidateStorefront(result.productCode)
    }
  }

  return { ok: true, results }
}
