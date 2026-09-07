/**
 * Custom next/image loader — wired via `next.config.ts`'s
 * `images.loader: "custom"`. No host's image-optimization service sits in
 * the critical path (plan §7 / host-agnostic constraint): this just maps
 * the width Next requests (it asks for several, to build a responsive
 * `srcset`) to the nearest width actually generated for that image, and
 * returns the same-origin image route for that rendition.
 *
 * Two independent width sets exist — product photos (three widths) and
 * the single brand logo (three SMALLER widths, since a logo never renders
 * at a full-bleed detail-view size). Picking the wrong set would rewrite a
 * `brand/logo-...` URL to a width like 1600 that was never uploaded,
 * 404ing the image — see brand-image-keys.ts's BRAND_LOGO_WIDTHS.
 *
 * IMPORTANT: both width lists must stay in sync with
 * `PRODUCT_IMAGE_WIDTHS` (lib/image-resize.ts) and `BRAND_LOGO_WIDTHS`
 * (lib/brand-image-keys.ts). Duplicated here rather than imported because
 * those modules are `"use client"` boundaries and this loader must also
 * run in server/build contexts (Next may invoke a custom loader during
 * SSR and static generation, not just in the browser).
 */

const PRODUCT_IMAGE_WIDTHS = [480, 800, 1600] as const
const BRAND_LOGO_WIDTHS = [128, 256, 512] as const

type ImageLoaderParams = {
  src: string
  width: number
  quality?: number
}

export default function productImageLoader({ src, width }: ImageLoaderParams): string {
  const widths = src.includes("/brand/logo-") ? BRAND_LOGO_WIDTHS : PRODUCT_IMAGE_WIDTHS
  return replaceWidthSuffix(src, nearestWidth(width, widths))
}

function nearestWidth(requested: number, available: readonly number[]): number {
  return available.reduce((best, candidate) =>
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
