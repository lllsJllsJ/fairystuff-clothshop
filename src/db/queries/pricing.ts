import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { products } from "@/db/schema"
import { getShopSettings } from "@/db/queries/settings"
import { activeShopSale, type ShopSale } from "@/lib/pricing"

/**
 * THE effective-price rule for every database read — storefront listing,
 * sort and Sale filter, product detail, checkout, and the admin order
 * picker all derive the price a customer pays from these fragments, never
 * from `products.sellPrice` directly. Its TS mirror (admin preview, unit
 * tests) is src/lib/pricing.ts#effectivePrice — keep the two identical.
 *
 * The shop-wide sale is one settings row, resolved in TS (activeShopSale)
 * and inlined as a parameter; the per-product discount is evaluated in SQL
 * against now(). The raw discount columns are only READ here — none of them
 * is ever returned on a public path, only the derived values below.
 */

/** The shop-wide sale running right now, or null. */
export async function getActiveShopSale(now: Date = new Date()): Promise<ShopSale | null> {
  return activeShopSale(await getShopSettings(), now)
}

const productDiscountActive = sql`(${products.discountEnabled}
  and ${products.discountType} is not null
  and ${products.discountValue} is not null
  and (${products.discountStartsAt} is null or ${products.discountStartsAt} <= now())
  and (${products.discountEndsAt} is null or ${products.discountEndsAt} > now()))`

/** Effective price as a numeric SQL expression (usable in ORDER BY / WHERE). */
export function effectivePriceSql(sale: ShopSale | null): SQL<string> {
  const fallback = sale
    ? sql`round(${products.sellPrice} * (100 - ${sale.percent}::numeric) / 100)`
    : sql`${products.sellPrice}`
  return sql<string>`(case
    when ${productDiscountActive} then
      case when ${products.discountType} = 'percent'
        then round(${products.sellPrice} * (100 - ${products.discountValue}) / 100)
        else least(${products.discountValue}, ${products.sellPrice})
      end
    else ${fallback}
  end)`
}

/** True when the effective price is below the regular price. */
export function onSaleSql(sale: ShopSale | null): SQL<boolean> {
  return sql<boolean>`${effectivePriceSql(sale)} < ${products.sellPrice}`
}

/**
 * Select-list fragment: `sellPrice` = the EFFECTIVE price (what the
 * customer pays — the same meaning `sellPrice` has on a cart line and an
 * order line), `regularPrice` = products.sellPrice (struck through when
 * higher than `sellPrice`), and
 * `discountEndsAt` (end of whichever discount applies, for the countdown).
 * Every value is public-safe; none is a cost.
 */
export function priceColumns(sale: ShopSale | null) {
  const shopEnd = sale?.endsAt ? sql`${sale.endsAt.toISOString()}::timestamptz` : sql`null::timestamptz`
  return {
    sellPrice: sql<string>`${effectivePriceSql(sale)}::text`.mapWith(String),
    regularPrice: products.sellPrice,
    discountEndsAt: sql<string | null>`(case
      when ${productDiscountActive} and ${effectivePriceSql(sale)} < ${products.sellPrice} then ${products.discountEndsAt}
      when ${productDiscountActive} then null
      when ${sale ? sql`true` : sql`false`} then ${shopEnd}
      else null
    end)`.mapWith((v: string | Date | null) => (v == null ? null : new Date(v).toISOString())),
  }
}
