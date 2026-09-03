import sharp from "sharp"

import { PRODUCT_IMAGE_WIDTHS } from "@/lib/product-image-keys"

export { PRODUCT_IMAGE_WIDTHS }

export type ImageRendition = {
  width: (typeof PRODUCT_IMAGE_WIDTHS)[number]
  buffer: Buffer
}

export async function renderImageRenditions(input: Buffer): Promise<ImageRendition[]> {
  const normalized = await sharp(input).rotate().withMetadata({ orientation: 1 }).toBuffer()
  return Promise.all(
    PRODUCT_IMAGE_WIDTHS.map(async (width) => ({
      width,
      buffer: await sharp(normalized)
        .resize({ width, fit: "inside", withoutEnlargement: false })
        .webp({ quality: 84, effort: 5 })
        .toBuffer(),
    }))
  )
}

export function catalogImageKey(
  productId: string,
  imageIndex: number,
  width: number,
  hash: string
): string {
  return `products/${productId}/catalog-${String(imageIndex).padStart(2, "0")}-${hash.slice(0, 12)}-${width}.webp`
}
