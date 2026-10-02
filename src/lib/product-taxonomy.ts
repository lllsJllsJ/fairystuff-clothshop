/**
 * Audience + kind vocabulary shared by the admin, the import/export
 * template, and the storefront. Client-safe (no server imports).
 */

/** `both` = the product comes in adult AND kids sizes (e.g. matching
 * family sets). It is listed under both storefront tabs. */
export const PRODUCT_AUDIENCES = ["adult", "kids", "both"] as const
export type ProductAudience = (typeof PRODUCT_AUDIENCES)[number]

/** What a shopper filters by — a `both` product matches either. */
export type AudienceFilterValue = Exclude<ProductAudience, "both">

export function isAudienceFilter(value: unknown): value is AudienceFilterValue {
  return value === "adult" || value === "kids"
}

/** The product audiences a storefront filter value should match. */
export function audiencesMatching(filter: AudienceFilterValue): ProductAudience[] {
  return [filter, "both"]
}

/** i18n key under `product` for an audience's label. */
export const AUDIENCE_LABEL_KEY: Record<ProductAudience, "audienceAdult" | "audienceKids" | "audienceBoth"> = {
  adult: "audienceAdult",
  kids: "audienceKids",
  both: "audienceBoth",
}

export const PRODUCT_KINDS = ["single", "set", "fullset"] as const
export type ProductKind = (typeof PRODUCT_KINDS)[number]

/**
 * Sets and full sets are numbered in their own series regardless of product
 * type (`SET-001`, `FULL-001`); a single item uses its type's prefix. These
 * prefixes are reserved — no product type may claim them.
 */
export const KIND_CODE_PREFIX: Record<Exclude<ProductKind, "single">, string> = {
  set: "SET",
  fullset: "FULL",
}

export const RESERVED_CODE_PREFIXES: ReadonlySet<string> = new Set(
  Object.values(KIND_CODE_PREFIX)
)

export function isProductAudience(value: unknown): value is ProductAudience {
  return typeof value === "string" && (PRODUCT_AUDIENCES as readonly string[]).includes(value)
}

export function isProductKind(value: unknown): value is ProductKind {
  return typeof value === "string" && (PRODUCT_KINDS as readonly string[]).includes(value)
}

/**
 * How many products the owner may hand-pick as "Popular" (Settings ->
 * Storefront). Also the size of the home page's Popular section, which
 * shows the whole list.
 */
export const MAX_POPULAR_PRODUCTS = 8
