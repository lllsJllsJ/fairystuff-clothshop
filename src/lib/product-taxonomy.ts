/**
 * Audience + kind vocabulary shared by the admin, the import/export
 * template, and the storefront. Client-safe (no server imports).
 */

export const PRODUCT_AUDIENCES = ["adult", "kids"] as const
export type ProductAudience = (typeof PRODUCT_AUDIENCES)[number]

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
