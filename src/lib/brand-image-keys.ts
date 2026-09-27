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

/** Home-page hero carousel photos — up to MAX_HERO_IMAGES, each stored as
 * `brand/hero-<timestamp>-<width>.webp`. Wider renditions than the logo
 * because a hero photo renders at up to half the 1440px page width on
 * desktop (and full width on phones at 2-3x DPR). Keep in sync with
 * lib/image-loader.ts's HERO_IMAGE_WIDTHS. */
export const HERO_IMAGE_WIDTHS = [640, 1280, 1920] as const
export const MAX_HERO_IMAGES = 3

const HERO_IMAGE_KEY = /^brand\/hero-\d+-(?:640|1280|1920)\.webp$/

export function isHeroImageKey(storageKey: string): boolean {
  return HERO_IMAGE_KEY.test(storageKey)
}

/** Stable same-origin URL for a hero photo's canonical (widest) key. */
export function heroImageUrl(storageKey: string): string {
  if (!isHeroImageKey(storageKey)) {
    throw new Error(`Invalid hero image key: ${storageKey}`)
  }
  return `/api/images/${storageKey}`
}

export function heroImageRenditionKeys(storageKey: string): string[] {
  const suffix = /-(?:640|1280|1920)\.webp$/
  if (!suffix.test(storageKey)) return [storageKey]
  return HERO_IMAGE_WIDTHS.map((width) => storageKey.replace(suffix, `-${width}.webp`))
}
