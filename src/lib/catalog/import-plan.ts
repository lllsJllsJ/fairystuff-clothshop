import { CATALOG_QUANTITY, CATALOG_SIZE } from "./schema"

export type StagedImageRecord = { canonicalKey: string; url: string }

export function catalogVariantInsert(productId: string, color: string) {
  return {
    productId,
    color,
    size: CATALOG_SIZE,
    quantity: CATALOG_QUANTITY,
    sortOrder: 0,
  }
}

export function catalogImageInserts(
  productId: string,
  productName: string,
  color: string,
  images: StagedImageRecord[]
) {
  return images.map((image, index) => ({
    productId,
    url: image.url,
    storageKey: image.canonicalKey,
    alt: productName,
    color: index === 0 ? null : color,
    sortOrder: index,
  }))
}
