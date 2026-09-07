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

import { BRAND_LOGO_WIDTHS } from "@/lib/brand-image-keys"

export const PRODUCT_IMAGE_WIDTHS = [480, 800, 1600] as const
export type ProductImageWidth = (typeof PRODUCT_IMAGE_WIDTHS)[number]

export type ResizedImage<Width extends number = number> = {
  width: Width
  height: number
  blob: Blob
}

const WEBP_QUALITY = 0.82

/**
 * Resizes a picked File into WebP blobs at each of `widths`. Never
 * upscales — a target width larger than the source image's natural width
 * is skipped, so a small source photo doesn't get blown up into a blurry
 * oversized file. If the source is narrower than every target, one
 * rendition is produced at its native size and filed under the smallest
 * bucket. Shared by `resizeProductImage` (three widths) and
 * `resizeBrandLogo` (three smaller widths) — see brand-image-keys.ts.
 */
async function resizeToWidths<Width extends number>(
  file: File,
  widths: readonly Width[]
): Promise<ResizedImage<Width>[]> {
  const bitmap = await createImageBitmap(file)
  try {
    const results: ResizedImage<Width>[] = []
    for (const width of widths) {
      if (width > bitmap.width) continue
      const height = Math.round((bitmap.height / bitmap.width) * width)
      const blob = await drawToWebp(bitmap, width, height)
      results.push({ width, height, blob })
    }

    if (results.length === 0) {
      const blob = await drawToWebp(bitmap, bitmap.width, bitmap.height)
      results.push({
        width: widths[0],
        height: bitmap.height,
        blob,
      })
    }

    return results
  } finally {
    bitmap.close()
  }
}

/**
 * Resizes a picked File into WebP blobs at the pre-generated widths the
 * loader and `next.config.ts`'s remote pattern expect.
 */
export async function resizeProductImage(file: File): Promise<ResizedImage<ProductImageWidth>[]> {
  return resizeToWidths(file, PRODUCT_IMAGE_WIDTHS)
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

/**
 * Resizes a picked File into WebP blobs at the brand logo's pre-generated
 * widths (src/lib/brand-image-keys.ts's BRAND_LOGO_WIDTHS) — smaller than
 * the product widths since a logo only ever renders in a header/footer,
 * never a full-bleed detail view.
 */
export async function resizeBrandLogo(
  file: File
): Promise<ResizedImage<(typeof BRAND_LOGO_WIDTHS)[number]>[]> {
  return resizeToWidths(file, BRAND_LOGO_WIDTHS)
}

/**
 * Storage key for one brand-logo rendition:
 * `brand/logo-<timestamp>-<width>.webp`. Unlike products, there is only
 * ever one logo, so no `index` — a fresh `timestamp` on every upload is
 * enough to keep a replacement from colliding with the previous file.
 */
export function buildBrandLogoKey(
  width: (typeof BRAND_LOGO_WIDTHS)[number],
  timestamp: number = Date.now()
): string {
  return `brand/logo-${timestamp}-${width}.webp`
}
