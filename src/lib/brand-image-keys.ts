/** Same purpose as product-image-keys.ts, for the single brand logo
 * instead of a per-product image matrix. Key shape:
 * `brand/logo-<timestamp>-<width>.webp`. The timestamp changes on every
 * upload so replacing the logo never collides with (or requires busting a
 * cache for) the previous one — the new URL is simply different. */

export const BRAND_LOGO_WIDTHS = [128, 256, 512] as const

const BRAND_LOGO_KEY = /^brand\/logo-\d+-(?:128|256|512)\.webp$/

export function isBrandLogoKey(storageKey: string): boolean {
  return BRAND_LOGO_KEY.test(storageKey)
}

/** Stable same-origin URL; the backing bucket may remain private. */
export function brandLogoUrl(storageKey: string): string {
  if (!isBrandLogoKey(storageKey)) {
    throw new Error(`Invalid brand logo key: ${storageKey}`)
  }
  return `/api/images/${storageKey}`
}

export function brandLogoRenditionKeys(storageKey: string): string[] {
  const suffix = /-(?:128|256|512)\.webp$/
  if (!suffix.test(storageKey)) return [storageKey]
  return BRAND_LOGO_WIDTHS.map((width) => storageKey.replace(suffix, `-${width}.webp`))
}
