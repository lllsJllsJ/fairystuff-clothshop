/**
 * Brand placeholders (plan §15, "Placeholders you'll need to fill in").
 * Every value below is a TODO — grep for them before launch:
 *
 *   grep -rn "TODO:" src/lib/brand.ts
 *
 * This file is imported from both server and client code (contact CTAs,
 * metadata, JSON-LD) — keep it free of secrets and server-only imports.
 */

// TODO: replace with the real brand name.
export const BRAND_NAME = "Your Label"

// TODO: replace with the real LINE Official Account ID
// (e.g. "@yourlabel" — keep the leading "@").
export const LINE_ID = "@yourlabel"
export const LINE_URL = `https://line.me/R/ti/p/${LINE_ID}`

// TODO: replace with the real Instagram handle (no leading "@").
export const INSTAGRAM_HANDLE = "yourlabel"
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_HANDLE}`

// TODO: replace with real contact copy for the order CTA (plan: "Order CTA
// = LINE + Instagram DM, no checkout").
export const CONTACT_COPY_TH =
  "สนใจสั่งซื้อ ทักแชททาง LINE หรือ Instagram ได้เลยค่ะ"
export const CONTACT_COPY_EN =
  "Interested in an order? Message us on LINE or Instagram."

// TODO: replace with the real brand story once it's written — used on the
// home hero and /about.
export const BRAND_TAGLINE_TH = "แบรนด์เสื้อผ้าอิสระจากกรุงเทพฯ"
export const BRAND_TAGLINE_EN = "An independent Bangkok clothing label."

// TODO: replace with the real about-page story copy.
export const ABOUT_STORY_TH =
  "เรื่องราวแบรนด์ของคุณจะอยู่ตรงนี้ — แก้ไขได้ที่ src/lib/brand.ts"
export const ABOUT_STORY_EN =
  "Your brand story goes here — edit it in src/lib/brand.ts."

/**
 * Builds a public R2 URL for a stored product image storage key
 * (`products/<productId>/<file>.webp`). Requires
 * `NEXT_PUBLIC_R2_PUBLIC_URL` (the R2 bucket's public custom domain, e.g.
 * `https://img.example.com`, no trailing slash — see .env.example).
 * Exposed to the client by design (it's a public CDN URL, not a secret).
 */
export function r2PublicUrl(storageKey: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  if (!base) {
    throw new Error("NEXT_PUBLIC_R2_PUBLIC_URL is not set. See .env.example.")
  }
  return `${base.replace(/\/+$/, "")}/${storageKey.replace(/^\/+/, "")}`
}
