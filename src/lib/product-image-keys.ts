export const PRODUCT_IMAGE_WIDTHS = [480, 800, 1600] as const

const PRODUCT_IMAGE_KEY = /^products\/[0-9a-f-]{36}\/[a-zA-Z0-9-]+-(?:480|800|1600)\.webp$/

export function isProductImageKey(storageKey: string): boolean {
  return PRODUCT_IMAGE_KEY.test(storageKey)
}

/** Stable same-origin URL; the backing bucket may remain private. */
export function productImageUrl(storageKey: string): string {
  if (!isProductImageKey(storageKey)) {
    throw new Error(`Invalid product image key: ${storageKey}`)
  }
  return `/api/images/${storageKey}`
}

export function productImageRenditionKeys(storageKey: string): string[] {
  const suffix = /-(?:480|800|1600)\.webp$/
  if (!suffix.test(storageKey)) return [storageKey]
  return PRODUCT_IMAGE_WIDTHS.map((width) => storageKey.replace(suffix, `-${width}.webp`))
}
