/**
 * Custom next/image loader — wired via `next.config.ts`'s
 * `images.loader: "custom"`. No host's image-optimization service sits in
 * the critical path (plan §7 / host-agnostic constraint): this just maps
 * the width Next requests (it asks for several, to build a responsive
 * `srcset`) to the nearest of the three widths `lib/image-resize.ts`
 * actually generated, and returns the R2 URL for that rendition as-is.
 *
 * IMPORTANT: `AVAILABLE_WIDTHS` must stay in sync with
 * `PRODUCT_IMAGE_WIDTHS` in `lib/image-resize.ts`. It is duplicated here
 * rather than imported because that module is a `"use client"` boundary
 * and this loader must also run in server/build contexts (Next may invoke
 * a custom loader during SSR and static generation, not just in the
 * browser).
 */

const AVAILABLE_WIDTHS = [480, 800, 1600] as const

type ImageLoaderParams = {
  src: string
  width: number
  quality?: number
}

export default function productImageLoader({ src, width }: ImageLoaderParams): string {
  return replaceWidthSuffix(src, nearestWidth(width))
}

function nearestWidth(requested: number): number {
  return AVAILABLE_WIDTHS.reduce((best, candidate) =>
    Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best
  )
}

/**
 * Swaps the trailing `-<width>.webp` in a stored URL for the nearest
 * available width (the naming convention `buildProductImageKey` produces).
 * Falls back to the source URL unchanged if it doesn't match that shape —
 * defensive, so a malformed or hand-entered URL still renders at its
 * stored size rather than 404ing.
 */
function replaceWidthSuffix(src: string, width: number): string {
  const match = src.match(/^(.*-)(\d+)(\.webp)$/)
  if (!match) return src
  return `${match[1]}${width}${match[3]}`
}
