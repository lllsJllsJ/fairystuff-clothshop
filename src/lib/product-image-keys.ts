export const PRODUCT_IMAGE_WIDTHS = [480, 800, 1600] as const

export function productImageRenditionKeys(storageKey: string): string[] {
  const suffix = /-(?:480|800|1600)\.webp$/
  if (!suffix.test(storageKey)) return [storageKey]
  return PRODUCT_IMAGE_WIDTHS.map((width) => storageKey.replace(suffix, `-${width}.webp`))
}
