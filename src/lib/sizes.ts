/**
 * Size presets and ordering — the single source for every size list in the
 * app (admin editor, import/export, storefront filter and chips).
 *
 * Presets are SHORTCUTS, never a restriction: `size` is free text (max 40
 * chars, see validations/product.ts), so an item that doesn't follow either
 * index ("One size", "US 7", "3-4Y") is stored exactly as typed and simply
 * sorts after the presets.
 */

import type { ProductAudience } from "@/lib/product-taxonomy"

export const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "Free Size"] as const

/** Kids are sized by the child's height, in 10 cm steps. */
export const KIDS_SIZES = [
  "80cm",
  "90cm",
  "100cm",
  "110cm",
  "120cm",
  "130cm",
  "140cm",
  "150cm",
  ">150cm",
] as const

export const MAX_SIZE_LENGTH = 40

export function sizePresetsFor(audience: ProductAudience): readonly string[] {
  if (audience === "kids") return KIDS_SIZES
  if (audience === "both") return [...ADULT_SIZES, ...KIDS_SIZES]
  return ADULT_SIZES
}

const PRESET_RANK = new Map<string, number>(
  [...ADULT_SIZES, ...KIDS_SIZES].map((size, index) => [size.toLowerCase(), index])
)

export function isPresetSize(size: string): boolean {
  return PRESET_RANK.has(size.trim().toLowerCase())
}

/**
 * Presets in index order, then custom sizes in the order given (stable), so
 * a custom size the owner typed stays where they put it relative to other
 * custom sizes. Returns a new array.
 */
export function sortSizes(sizes: readonly string[]): string[] {
  return sizes
    .map((size, index) => ({ size, index, rank: PRESET_RANK.get(size.trim().toLowerCase()) }))
    .sort((a, b) => {
      if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank
      if (a.rank !== undefined) return -1
      if (b.rank !== undefined) return 1
      return a.index - b.index
    })
    .map((entry) => entry.size)
}

/** Trim, drop blanks, dedupe case-insensitively (first spelling wins). */
export function normalizeSizes(sizes: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of sizes) {
    const size = raw.trim().slice(0, MAX_SIZE_LENGTH)
    const key = size.toLowerCase()
    if (!size || seen.has(key)) continue
    seen.add(key)
    out.push(size)
  }
  return out
}
