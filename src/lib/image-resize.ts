"use client"

/**
 * Browser-side image resize — canvas -> WebP, three widths. Runs entirely
 * in the browser so a 12 MP phone photo never touches the server (dodges
 * serverless request-body limits) and no host's image-optimization service
 * needs to sit in the critical path (plan §7 / host-agnostic constraint).
 *
 * Pairs with `lib/image-loader.ts`, next/image's custom loader, which maps
 * a requested render width back to the nearest of these three
 * pre-generated widths. Whichever rendition's URL gets stored as
 * `productImages.url` (the action layer's call — conventionally the
 * widest, 1600w, so a zoomed detail view has enough resolution) is the
 * "canonical" URL the loader derives every other width from by swapping
 * the trailing `-<width>.webp` suffix. Keep `PRODUCT_IMAGE_WIDTHS` here in
 * sync with the loader's `AVAILABLE_WIDTHS` if this ever changes.
 */

export const PRODUCT_IMAGE_WIDTHS = [480, 800, 1600] as const
export type ProductImageWidth = (typeof PRODUCT_IMAGE_WIDTHS)[number]

export type ResizedImage = {
  width: ProductImageWidth
  height: number
  blob: Blob
}

const WEBP_QUALITY = 0.82

/**
 * Resizes a picked File into WebP blobs at the pre-generated widths the
 * loader and `next.config.ts`'s remote pattern expect. Never upscales — a
 * target width larger than the source image's natural width is skipped,
 * so a small source photo doesn't get blown up into a blurry "1600w" file.
 * If the source is narrower than every target, one rendition is produced
 * at its native size and filed under the smallest bucket.
 */
export async function resizeProductImage(file: File): Promise<ResizedImage[]> {
  const bitmap = await createImageBitmap(file)
  try {
    const results: ResizedImage[] = []
    for (const width of PRODUCT_IMAGE_WIDTHS) {
      if (width > bitmap.width) continue
      const height = Math.round((bitmap.height / bitmap.width) * width)
      const blob = await drawToWebp(bitmap, width, height)
      results.push({ width, height, blob })
    }

    if (results.length === 0) {
      const blob = await drawToWebp(bitmap, bitmap.width, bitmap.height)
      results.push({
        width: PRODUCT_IMAGE_WIDTHS[0],
        height: bitmap.height,
        blob,
      })
    }

    return results
  } finally {
    bitmap.close()
  }
}

function drawToWebp(
  bitmap: ImageBitmap,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable.")
  ctx.drawImage(bitmap, 0, 0, width, height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("WebP encoding failed."))),
      "image/webp",
      WEBP_QUALITY
    )
  })
}

/**
 * Storage key for one rendition, matching plan §7's scheme:
 * `products/<productId>/<timestamp>-<index>-<width>.webp`. `index` is the
 * position of the source photo within the current upload batch (0-based),
 * so multiple photos uploaded together don't collide; `timestamp` (shared
 * across a single photo's three renditions — pass the same value for all
 * three calls) keeps re-uploads of the same slot from colliding with the
 * previous version.
 */
export function buildProductImageKey(
  productId: string,
  index: number,
  width: ProductImageWidth,
  timestamp: number = Date.now()
): string {
  return `products/${productId}/${timestamp}-${index}-${width}.webp`
}
