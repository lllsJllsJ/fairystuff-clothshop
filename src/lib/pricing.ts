/**
 * Discount pricing rules — pure, client-safe helpers.
 *
 * The authoritative effective price for every database read (storefront,
 * checkout, admin picker, sort, Sale filter) is the SQL in
 * src/db/queries/pricing.ts#priceColumns. `effectivePrice()` below is its TS
 * mirror, used for the admin editor's live preview and pinned by
 * pricing.test.ts — keep the two identical:
 *
 *   1. the product's own discount, if it is running, WINS;
 *   2. otherwise the shop-wide % sale, if it is running;
 *   3. otherwise the regular sellPrice.
 *
 * "Running" = switched on AND now is inside the optional [startsAt, endsAt)
 * window. Discounted prices round to whole baht; a fixed sale price at or
 * above the regular price means "no discount".
 *
 * Naming: the pre-discount public price is `regularPrice`. Never call it
 * "original" — `products.originalPrice` is the private COST.
 */

export type DiscountType = "percent" | "price"

export type ShopSale = { percent: number; endsAt: Date | null }

export type ProductDiscount = {
  discountEnabled: boolean
  discountType: DiscountType | null
  discountValue: number | string | null
  discountStartsAt: Date | string | null
  discountEndsAt: Date | string | null
}

export type EffectivePrice = {
  price: number
  regularPrice: number
  /** When the applied discount ends; null if none applies or no end date. */
  endsAt: Date | null
  source: "product" | "shop" | null
}

/** Shop sale percent bounds — mirrored by the DB check constraints. */
export const MIN_DISCOUNT_PERCENT = 1
export const MAX_DISCOUNT_PERCENT = 90

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isWindowActive(
  enabled: boolean,
  startsAt: Date | string | null | undefined,
  endsAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!enabled) return false
  const start = toDate(startsAt)
  const end = toDate(endsAt)
  if (start && start.getTime() > now.getTime()) return false
  if (end && end.getTime() <= now.getTime()) return false
  return true
}

export type SaleStatus = "off" | "scheduled" | "running" | "ended"

export function windowStatus(
  enabled: boolean,
  startsAt: Date | string | null | undefined,
  endsAt: Date | string | null | undefined,
  now: Date = new Date()
): SaleStatus {
  if (!enabled) return "off"
  const start = toDate(startsAt)
  const end = toDate(endsAt)
  if (end && end.getTime() <= now.getTime()) return "ended"
  if (start && start.getTime() > now.getTime()) return "scheduled"
  return "running"
}

export function activeShopSale(
  settings: {
    saleEnabled: boolean
    salePercent: number | string | null
    saleStartsAt: Date | string | null
    saleEndsAt: Date | string | null
  },
  now: Date = new Date()
): ShopSale | null {
  const percent = Number(settings.salePercent ?? 0)
  if (!(percent >= MIN_DISCOUNT_PERCENT && percent <= MAX_DISCOUNT_PERCENT)) return null
  if (!isWindowActive(settings.saleEnabled, settings.saleStartsAt, settings.saleEndsAt, now)) return null
  return { percent, endsAt: toDate(settings.saleEndsAt) }
}

/** Round half away from zero to whole baht — matches Postgres round(numeric). */
export function roundBaht(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

export function applyPercent(regular: number, percent: number): number {
  return roundBaht((regular * (100 - percent)) / 100)
}

export function effectivePrice(
  sellPrice: number | string,
  discount: ProductDiscount,
  shopSale: ShopSale | null,
  now: Date = new Date()
): EffectivePrice {
  const regularPrice = Number(sellPrice)
  const value = Number(discount.discountValue ?? 0)
  if (
    discount.discountType &&
    discount.discountValue != null &&
    isWindowActive(discount.discountEnabled, discount.discountStartsAt, discount.discountEndsAt, now)
  ) {
    const price =
      discount.discountType === "percent" ? applyPercent(regularPrice, value) : Math.min(value, regularPrice)
    return { price, regularPrice, endsAt: toDate(discount.discountEndsAt), source: "product" }
  }
  if (shopSale) {
    return {
      price: applyPercent(regularPrice, shopSale.percent),
      regularPrice,
      endsAt: shopSale.endsAt,
      source: "shop",
    }
  }
  return { price: regularPrice, regularPrice, endsAt: null, source: null }
}

/** Whole-number "% off" for the badge, or null when there is no discount. */
export function percentOff(price: number | string, regularPrice: number | string | null | undefined): number | null {
  const p = Number(price)
  const r = Number(regularPrice ?? 0)
  if (!(r > 0) || !(p < r)) return null
  return Math.max(1, Math.round(((r - p) / r) * 100))
}

const BANGKOK_OFFSET = "+07:00"

/** Date -> `datetime-local` value in Bangkok time ("2026-10-31T23:59"). */
export function toBangkokInput(value: Date | string | null | undefined): string {
  const d = toDate(value)
  if (!d) return ""
  const shifted = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 16)
}

/** `datetime-local` value read as Bangkok time -> Date (null when blank/invalid). */
export function fromBangkokInput(value: string | null | undefined): Date | null {
  const v = value?.trim()
  if (!v) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return null
  return toDate(`${v.length === 16 ? `${v}:00` : v}${BANGKOK_OFFSET}`)
}
