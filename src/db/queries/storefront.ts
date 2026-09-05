import "server-only"

import { and, asc, count, desc, eq, exists, gte, ilike, inArray, lte, or, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  characters,
  productCharacters,
  productImages,
  products,
  productVariants,
} from "@/db/schema"

/**
 * ============================================================================
 * THE PUBLIC / PRIVATE SPLIT — read this before touching this file.
 * ============================================================================
 *
 * Under the old Supabase design this split was a database view plus a
 * REVOKE. The database has no public API, so there is no browser-side query to lock
 * down — but that also means there is no second layer left to catch a
 * mistake here. This file (and only this file) is the entire boundary.
 *
 * PUBLIC_PRODUCT_COLUMNS below is the ONLY column set the public may ever
 * see. Every storefront query and every `/api/products` response MUST
 * derive its select list from this object. Never spread `products.*`,
 * never `select *`, never pass a full product row (fetched elsewhere, e.g.
 * from `queries/products.ts`) into a component that renders on `/` or
 * `/shop`.
 *
 * DO NOT add: originalPrice, buyingSource, sourceLink, margin, or any
 * `product_variants.quantity` value (exact stock depth) to anything
 * exported from this file. Every active variant remains preorderable;
 * stock is an admin-only operational field.
 *
 * Why this matters more here than it would in a typical app: a Server
 * Component that fetches a full product row and hands it to a client
 * component serialises EVERY field into the RSC payload, including fields
 * the JSX never renders (plan Risk 2). The only reliable fix is to never
 * fetch the private fields on the public path in the first place — which
 * is what deriving every storefront select from this one object gives you
 * structurally, not just by convention. See plan §13 check 3 and
 * docs/health-check.md for the standing leak test that re-verifies this.
 */
export const PUBLIC_PRODUCT_COLUMNS = {
  id: products.id,
  productCode: products.productCode,
  productName: products.productName,
  description: products.description,
  sellPrice: products.sellPrice,
  createdAt: products.createdAt,
} as const

type BasePublicProduct = {
  id: string
  productCode: string
  productName: string
  description: string | null
  sellPrice: string
  createdAt: Date
}

export type PublicProductSummary = BasePublicProduct & {
  /** Cover photo (productImages.sortOrder = 0), or null if none uploaded. */
  coverImageUrl: string | null
  /** Distinct variant colours, "-" (the one-colour sentinel) excluded. */
  colors: string[]
  characters: PublicCharacter[]
}

export type PublicProductVariant = {
  id: string
  color: string
  size: string
  sortOrder: number
}

export type PublicProductImage = {
  id: string
  url: string
  alt: string | null
  /** Null = shown for every colour; a specific colour swaps the gallery
   * when that swatch is picked. */
  color: string | null
  sortOrder: number
}

export type PublicProductDetail = BasePublicProduct & {
  colors: string[]
  characters: PublicCharacter[]
  variants: PublicProductVariant[]
  images: PublicProductImage[]
}

export type PublicSort = "newest" | "price_asc" | "price_desc"

export type PublicProductListParams = {
  search?: string
  character?: string
  color?: string
  size?: string
  minPrice?: number
  maxPrice?: number
  sort?: PublicSort
  page?: number
  pageSize?: number
}

export type PublicProductListResult = {
  rows: PublicProductSummary[]
  count: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 24

/**
 * Shared WHERE for every public listing query. Always pins
 * `status = 'active'` — draft/archived products are unreachable through
 * this file by construction, not by a filter someone could forget to add
 * at a call site.
 */
function activeProductFilters(params: PublicProductListParams) {
  const conditions = [eq(products.status, "active")]

  const term = params.search?.trim()
  if (term) {
    const like = `%${term}%`
    const searchCondition = or(
      ilike(products.productName, like),
      ilike(products.productCode, like)
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  if (params.character) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(productCharacters)
          .innerJoin(characters, eq(characters.id, productCharacters.characterId))
          .where(
            and(
              eq(productCharacters.productId, products.id),
              eq(characters.slug, params.character)
            )
          )
      )
    )
  }

  if (params.minPrice != null) {
    conditions.push(gte(products.sellPrice, String(params.minPrice)))
  }
  if (params.maxPrice != null) {
    conditions.push(lte(products.sellPrice, String(params.maxPrice)))
  }

  if (params.color) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, products.id),
              eq(productVariants.color, params.color)
            )
          )
      )
    )
  }

  if (params.size) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, products.id),
              eq(productVariants.size, params.size)
            )
          )
      )
    )
  }

  const where = and(...conditions)
  // `and()` with a non-empty array always returns a defined SQL — the
  // `!` just satisfies its (necessarily variadic) optional-return type.
  return where!
}

function orderByForPublicSort(sort: PublicSort) {
  switch (sort) {
    case "price_asc":
      return asc(products.sellPrice)
    case "price_desc":
      return desc(products.sellPrice)
    case "newest":
    default:
      return desc(products.createdAt)
  }
}

/**
 * Catalogue listing for `/shop` and `GET /api/products`. Every returned row
 * is built from PUBLIC_PRODUCT_COLUMNS only.
 */
export async function getPublicProducts(
  params: PublicProductListParams = {}
): Promise<PublicProductListResult> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, sort = "newest" } = params
  const where = activeProductFilters(params)
  const orderBy = orderByForPublicSort(sort)

  const [rows, countRows] = await Promise.all([
    db
      .select(PUBLIC_PRODUCT_COLUMNS)
      .from(products)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(products).where(where),
  ])

  const rowsWithRelations = await attachSummaryRelations(rows)

  return {
    rows: rowsWithRelations,
    count: countRows[0]?.value ?? 0,
    page,
    pageSize,
  }
}

/**
 * Batch-fetches variants + images for a page of products and folds them
 * into the list-view summary shape (cover image, colours, characters).
 * Deliberately a second, id-scoped query rather than one joined/aggregated
 * query: it keeps the statement count predictable, and
 * this keeps every selected column's type traceable back to
 * PUBLIC_PRODUCT_COLUMNS or an explicitly safe variant/image projection.
 */
async function attachSummaryRelations(
  rows: BasePublicProduct[]
): Promise<PublicProductSummary[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const [variantRows, imageRows, characterRows] = await Promise.all([
    db
      .select({
        productId: productVariants.productId,
        color: productVariants.color,
      })
      .from(productVariants)
      .where(inArray(productVariants.productId, ids)),
    db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.sortOrder)),
    db
      .select({
        productId: productCharacters.productId,
        id: characters.id,
        slug: characters.slug,
        name: characters.name,
        nameEn: characters.nameEn,
      })
      .from(productCharacters)
      .innerJoin(characters, eq(characters.id, productCharacters.characterId))
      .where(inArray(productCharacters.productId, ids))
      .orderBy(asc(characters.sortOrder)),
  ])

  const variantsByProduct = groupBy(variantRows, (v) => v.productId)
  const imagesByProduct = groupBy(imageRows, (i) => i.productId)
  const charactersByProduct = groupBy(characterRows, (character) => character.productId)

  return rows.map((row) => {
    const variants = variantsByProduct.get(row.id) ?? []
    const images = imagesByProduct.get(row.id) ?? []
    return {
      ...row,
      coverImageUrl: images[0]?.url ?? null,
      colors: distinctColors(variants.map((v) => v.color)),
      characters: (charactersByProduct.get(row.id) ?? []).map((character) => ({
        id: character.id,
        slug: character.slug,
        name: character.name,
        nameEn: character.nameEn,
      })),
    }
  })
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = map.get(k)
    if (bucket) bucket.push(row)
    else map.set(k, [row])
  }
  return map
}

/** "-" is the one-colour sentinel (see schema.ts) — filtered out so a
 * single-colour item doesn't render a fake swatch option. */
function distinctColors(colors: string[]): string[] {
  return [...new Set(colors)].filter((c) => c !== "-").sort()
}

/**
 * Full detail for `/shop/[code]`. Returns null when the code doesn't exist
 * OR the product isn't `status = 'active'` — a draft/archived code must
 * 404 exactly like a nonexistent one, not leak through a slower path (plan
 * §13 check 5).
 */
export async function getPublicProductByCode(
  productCode: string
): Promise<PublicProductDetail | null> {
  const [row] = await db
    .select(PUBLIC_PRODUCT_COLUMNS)
    .from(products)
    .where(
      and(
        eq(products.status, "active"),
        eq(sql`lower(${products.productCode})`, productCode.trim().toLowerCase())
      )
    )
    .limit(1)

  if (!row) return null

  const [variantRows, imageRows, characterRows] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        color: productVariants.color,
        size: productVariants.size,
        sortOrder: productVariants.sortOrder,
      })
      .from(productVariants)
      .where(eq(productVariants.productId, row.id))
      .orderBy(asc(productVariants.sortOrder)),
    db
      .select({
        id: productImages.id,
        url: productImages.url,
        alt: productImages.alt,
        color: productImages.color,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(eq(productImages.productId, row.id))
      .orderBy(asc(productImages.sortOrder)),
    db
      .select({
        id: characters.id,
        slug: characters.slug,
        name: characters.name,
        nameEn: characters.nameEn,
      })
      .from(productCharacters)
      .innerJoin(characters, eq(characters.id, productCharacters.characterId))
      .where(eq(productCharacters.productId, row.id))
      .orderBy(asc(characters.sortOrder)),
  ])

  const variants: PublicProductVariant[] = variantRows.map((v) => ({
    id: v.id,
    color: v.color,
    size: v.size,
    sortOrder: v.sortOrder,
  }))

  return {
    ...row,
    colors: distinctColors(variants.map((v) => v.color)),
    characters: characterRows,
    variants,
    images: imageRows,
  }
}

export type PublicCharacter = {
  id: string
  slug: string
  name: string
  nameEn: string | null
}

export type PublicCharacterFacet = PublicCharacter & { count: number }

/**
 * Character facets actually present among active products, for the
 * customer-facing collection strip and `/shop` filter rail.
 */
export async function getPublicCharacters(): Promise<PublicCharacterFacet[]> {
  const rows = await db
    .select({
      id: characters.id,
      slug: characters.slug,
      name: characters.name,
      nameEn: characters.nameEn,
      value: count(productCharacters.productId),
    })
    .from(characters)
    .innerJoin(productCharacters, eq(productCharacters.characterId, characters.id))
    .innerJoin(products, eq(products.id, productCharacters.productId))
    .where(eq(products.status, "active"))
    .groupBy(characters.id)
    .orderBy(asc(characters.sortOrder), asc(characters.name))

  return rows.map(({ value, ...character }) => ({ ...character, count: value }))
}

/**
 * Every active product's code — feeds `generateStaticParams` for
 * `/shop/[code]`. Draft/archived codes are excluded so they are never
 * pre-rendered (and therefore correctly 404 if someone guesses the URL).
 */
export async function getActiveProductCodes(): Promise<string[]> {
  const rows = await db
    .select({ productCode: products.productCode })
    .from(products)
    .where(eq(products.status, "active"))
  return rows.map((r) => r.productCode)
}
