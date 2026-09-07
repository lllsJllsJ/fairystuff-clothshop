import "server-only"

import { asc, eq } from "drizzle-orm"

import { db } from "@/db"
import {
  customerStatusLabels,
  orderItemStatuses,
  orderStatusLabels,
  shopSettings,
} from "@/db/schema"
import { isValidFacebookUrl } from "@/lib/facebook"
import { BRAND_NAME, BRAND_TAGLINE_EN, BRAND_TAGLINE_TH } from "@/lib/brand"

export type OrderItemStatusDefinition = typeof orderItemStatuses.$inferSelect
export type OrderStatusLabel = typeof orderStatusLabels.$inferSelect
export type CustomerStatusLabel = typeof customerStatusLabels.$inferSelect
export type ShopSettings = typeof shopSettings.$inferSelect

export async function getOrderItemStatuses(options?: { activeOnly?: boolean }) {
  return db
    .select()
    .from(orderItemStatuses)
    .where(options?.activeOnly ? eq(orderItemStatuses.isActive, true) : undefined)
    .orderBy(asc(orderItemStatuses.sortOrder), asc(orderItemStatuses.code))
}

export async function getOrderStatusLabels() {
  return db.select().from(orderStatusLabels)
}

export async function getCustomerStatusLabels() {
  return db.select().from(customerStatusLabels)
}

export async function getShopSettings(): Promise<ShopSettings> {
  const fallback: ShopSettings = {
    id: "default",
    lineId: null,
    instagramHandle: null,
    facebookUrl: null,
    brandName: null,
    brandDescriptionTh: null,
    brandDescriptionEn: null,
    logoUrl: null,
    logoStorageKey: null,
    updatedAt: new Date(0),
  }
  try {
    const [row] = await db
      .select()
      .from(shopSettings)
      .where(eq(shopSettings.id, "default"))
      .limit(1)
    return row ?? fallback
  } catch (error) {
    // Production builds may intentionally run before migrations (Railway's
    // documented bootstrap path). Missing settings safely disables checkout;
    // the admin page still surfaces schema failures once the app is running.
    if (process.env.NEXT_PHASE !== "phase-production-build") throw error
    console.warn("[settings] shop settings unavailable during build")
    return fallback
  }
}

export function contactLinks(settings: Pick<ShopSettings, "lineId" | "instagramHandle" | "facebookUrl">) {
  const lineId = settings.lineId?.trim() ?? ""
  const instagramHandle = settings.instagramHandle?.trim().replace(/^@/, "") ?? ""
  return {
    // `/R/ti/p/<id>` opens a 1:1 chat with no prefill support — used by the
    // footer/contact-CTA links, which just need to open LINE, not carry a
    // message. `lineMessageUrl` below is the prefilled variant used by the
    // track page's contact button. The `@` is percent-encoded (`%40`) per
    // LINE's own documentation — a bare `@` still works but is deprecated.
    lineUrl: lineId ? `https://line.me/R/ti/p/${encodeURIComponent(lineId.startsWith("@") ? lineId : `@${lineId}`)}` : null,
    instagramUrl: instagramHandle ? `https://instagram.com/${instagramHandle}` : null,
    facebookUrl: settings.facebookUrl && isValidFacebookUrl(settings.facebookUrl) ? settings.facebookUrl : null,
  }
}

/**
 * Brand identity as it should actually be displayed: the admin-configured
 * value from `shop_settings` when set, otherwise the src/lib/brand.ts
 * placeholder so an unconfigured shop never shows blank copy. `brandName`
 * is a single value (brand names aren't translated, same as BRAND_NAME);
 * the description is locale-aware, mirroring BRAND_TAGLINE_TH/EN.
 */
export function resolvedBrandName(
  settings: Pick<ShopSettings, "brandName">
): string {
  return settings.brandName?.trim() || BRAND_NAME
}

export function resolvedBrandDescription(
  settings: Pick<ShopSettings, "brandDescriptionTh" | "brandDescriptionEn">,
  locale: string
): string {
  const value = locale === "th" ? settings.brandDescriptionTh : settings.brandDescriptionEn
  const fallback = locale === "th" ? BRAND_TAGLINE_TH : BRAND_TAGLINE_EN
  return value?.trim() || fallback
}

/**
 * The LINE "OA message" deep link: `https://line.me/R/oaMessage/{id}/?{text}`,
 * which opens the shop's LINE chat with `message` pre-typed into the
 * composer, ready for the customer to just hit send.
 *
 * A SEPARATE exported function rather than a new field on `contactLinks`'s
 * return object on purpose — that object's shape is also consumed by
 * `src/components/shop/contact-cta.tsx` and `src/components/shop/
 * site-footer.tsx`, which only ever use `lineUrl` as a plain `href` (no
 * message to prefill there) and render `settings.lineId` as the visible
 * label. Widening `contactLinks` would touch both call sites for no reason.
 *
 * KNOWN LIMITATION: this URL scheme is unsupported in LINE for PC — on
 * desktop it resolves to a profile/QR page and the prefill is silently
 * dropped. This is why the track page's contact button ALSO copies the code
 * to the clipboard before navigating: the copy is the real desktop fallback,
 * not a nicety.
 */
export function lineMessageUrl(
  settings: Pick<ShopSettings, "lineId">,
  message: string
): string | null {
  const lineId = settings.lineId?.trim()
  if (!lineId) return null
  const id = lineId.startsWith("@") ? lineId : `@${lineId}`
  return `https://line.me/R/oaMessage/${encodeURIComponent(id)}/?${encodeURIComponent(message)}`
}
