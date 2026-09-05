import "server-only"

import type { Column } from "drizzle-orm"
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm"

import { db } from "@/db"
import {
  characters,
  productCharacters,
  productImages,
  productStatus,
  products,
  productVariants,
} from "@/db/schema"

/**
 * Admin reads — full columns, INCLUDING `margin`, `originalPrice`,
 * `buyingSource`, and `sourceLink`. Every caller of this module must
 * already be behind `requireOwner()` (see plan Risk 1 — there is no RLS
 * behind it). Never import this module from anything that renders on the
 * public storefront; use `queries/storefront.ts` there instead.
 *
 * This file is read-mostly. A write that touches `products` +
 * `productVariants` + `productImages` together (create/update) MUST go
 * through `txDb()` (src/db/index.ts) inside the owning server action, not
 * `db` — multi-table writes belong in a `db.transaction(...)` (plan
 * Risk 3). Nothing here starts a transaction; that belongs to the action
 * layer in `src/app/admin/products/actions.ts`.
 */

export type ProductStatusValue = (typeof productStatus.enumValues)[number]

export type ProductRow = typeof products.$inferSelect
export type ProductVariantRow = typeof productVariants.$inferSelect
export type ProductImageRow = typeof productImages.$inferSelect
export type ProductCharacterRow = Pick<
  typeof characters.$inferSelect,
  "id" | "name" | "nameEn" | "slug" | "sortOrder"
>

export type ProductWithRelations = ProductRow & {
  variants: ProductVariantRow[]
  images: ProductImageRow[]
  characters: ProductCharacterRow[]
}

export type ProductSort =
  | "newest"
  | "oldest"
  | "price_high"
  | "price_low"
  | "name_asc"

export type ProductListParams = {
  search?: string
  status?: ProductStatusValue | "all"
  type?: string
  sort?: ProductSort
  page?: number
  pageSize?: number
}

export type ProductListResult = {
  rows: ProductWithRelations[]
  count: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 20

/** Same shape as carstockpro's `services/cars.ts` SORT_MAP: a column plus
 * direction, looked up by the sort key rather than switched on inline. */
const SORT_MAP: Record<ProductSort, { column: Column; ascending: boolean }> = {
  newest: { column: products.createdAt, ascending: false },
  oldest: { column: products.createdAt, ascending: true },
  price_high: { column: products.sellPrice, ascending: false },
  price_low: { column: products.sellPrice, ascending: true },
  name_asc: { column: products.productName, ascending: true },
}

/** Paginated, searchable, sortable product list for `/admin/products` and
 * `GET /api/admin/products`. Full columns — owner-gated by the caller. */
export async function getProducts(
  params: ProductListParams = {}
): Promise<ProductListResult> {
  const {
    search = "",
    status = "all",
    type,
    sort = "newest",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = params

  const conditions = []
  if (status !== "all") conditions.push(eq(products.status, status))
  if (type) conditions.push(eq(products.productType, type))

  const term = search.trim()
  if (term) {
    const like = `%${term}%`
    const searchCondition = or(
      ilike(products.productCode, like),
      ilike(products.productName, like),
      ilike(products.buyingSource, like)
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const { column, ascending } = SORT_MAP[sort] ?? SORT_MAP.newest
  const orderBy = ascending ? asc(column) : desc(column)

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(products).where(where),
  ])

  const rowsWithRelations = await attachRelations(rows)

  return {
    rows: rowsWithRelations,
    count: countRows[0]?.value ?? 0,
    page,
    pageSize,
  }
}

async function attachRelations(rows: ProductRow[]): Promise<ProductWithRelations[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const [variantRows, imageRows, characterRows] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(inArray(productVariants.productId, ids))
      .orderBy(asc(productVariants.sortOrder)),
    db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.sortOrder)),
    db
      .select({
        productId: productCharacters.productId,
        id: characters.id,
        name: characters.name,
        nameEn: characters.nameEn,
        slug: characters.slug,
        sortOrder: characters.sortOrder,
      })
      .from(productCharacters)
      .innerJoin(characters, eq(characters.id, productCharacters.characterId))
      .where(inArray(productCharacters.productId, ids))
      .orderBy(asc(characters.sortOrder)),
  ])

  const variantsByProduct = new Map<string, ProductVariantRow[]>()
  for (const v of variantRows) {
    const bucket = variantsByProduct.get(v.productId)
    if (bucket) bucket.push(v)
    else variantsByProduct.set(v.productId, [v])
  }

  const imagesByProduct = new Map<string, ProductImageRow[]>()
  for (const img of imageRows) {
    const bucket = imagesByProduct.get(img.productId)
    if (bucket) bucket.push(img)
    else imagesByProduct.set(img.productId, [img])
  }

  const charactersByProduct = new Map<string, ProductCharacterRow[]>()
  for (const { productId, ...character } of characterRows) {
    const bucket = charactersByProduct.get(productId)
    if (bucket) bucket.push(character)
    else charactersByProduct.set(productId, [character])
  }

  return rows.map((row) => ({
    ...row,
    variants: variantsByProduct.get(row.id) ?? [],
    images: imagesByProduct.get(row.id) ?? [],
    characters: charactersByProduct.get(row.id) ?? [],
  }))
}

/** Single product with its variants and images, for `/admin/products/[id]/edit`. */
export async function getProductById(id: string): Promise<ProductWithRelations | null> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1)
  if (!row) return null
  const [withRelations] = await attachRelations([row])
  return withRelations
}

/** Every product code currently in stock — used to flag duplicates during
 * an Excel import (the analogue of carstockpro's `getCarRegistrations()`). */
export async function getProductCodes(): Promise<string[]> {
  const rows = await db.select({ productCode: products.productCode }).from(products)
  return rows.map((r) => r.productCode)
}
