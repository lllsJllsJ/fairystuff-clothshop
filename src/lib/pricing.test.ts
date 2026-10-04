import assert from "node:assert/strict"
import test from "node:test"

import {
  activeShopSale,
  effectivePrice,
  fromBangkokInput,
  isWindowActive,
  percentOff,
  toBangkokInput,
  windowStatus,
  type ProductDiscount,
} from "./pricing"

const now = new Date("2026-10-04T12:00:00Z")
const noDiscount: ProductDiscount = {
  discountEnabled: false,
  discountType: null,
  discountValue: null,
  discountStartsAt: null,
  discountEndsAt: null,
}

test("window: start is inclusive, end is exclusive", () => {
  assert.equal(isWindowActive(true, now, null, now), true)
  assert.equal(isWindowActive(true, null, now, now), false)
  assert.equal(isWindowActive(false, null, null, now), false)
  assert.equal(isWindowActive(true, "2026-10-05T00:00:00Z", null, now), false)
})

test("window status", () => {
  assert.equal(windowStatus(false, null, null, now), "off")
  assert.equal(windowStatus(true, "2026-10-05T00:00:00Z", null, now), "scheduled")
  assert.equal(windowStatus(true, null, "2026-10-01T00:00:00Z", now), "ended")
  assert.equal(windowStatus(true, null, null, now), "running")
})

test("shop sale needs enabled, a valid percent, and an open window", () => {
  const base = { saleEnabled: true, salePercent: "20.00", saleStartsAt: null, saleEndsAt: null }
  assert.deepEqual(activeShopSale(base, now), { percent: 20, endsAt: null })
  assert.equal(activeShopSale({ ...base, saleEnabled: false }, now), null)
  assert.equal(activeShopSale({ ...base, salePercent: null }, now), null)
  assert.equal(activeShopSale({ ...base, saleEndsAt: "2026-10-01T00:00:00Z" }, now), null)
})

test("percent discount rounds to whole baht", () => {
  const r = effectivePrice("790", { ...noDiscount, discountEnabled: true, discountType: "percent", discountValue: "15" }, null, now)
  assert.equal(r.price, 672) // 671.5 rounds half up
  assert.equal(r.source, "product")
})

test("fixed sale price at or above regular means no discount", () => {
  const r = effectivePrice("500", { ...noDiscount, discountEnabled: true, discountType: "price", discountValue: "600" }, null, now)
  assert.equal(r.price, 500)
  assert.equal(percentOff(r.price, r.regularPrice), null)
})

test("product discount wins over the shop sale, even when smaller", () => {
  const shop = { percent: 30, endsAt: null }
  const r = effectivePrice("1000", { ...noDiscount, discountEnabled: true, discountType: "percent", discountValue: "10" }, shop, now)
  assert.equal(r.price, 900)
  assert.equal(r.source, "product")
})

test("an expired product discount falls back to the shop sale", () => {
  const shop = { percent: 20, endsAt: new Date("2026-10-31T16:59:00Z") }
  const r = effectivePrice(
    "1000",
    { ...noDiscount, discountEnabled: true, discountType: "price", discountValue: "500", discountEndsAt: "2026-10-01T00:00:00Z" },
    shop,
    now
  )
  assert.equal(r.price, 800)
  assert.equal(r.source, "shop")
  assert.equal(r.endsAt, shop.endsAt)
})

test("percentOff", () => {
  assert.equal(percentOff(632, 790), 20)
  assert.equal(percentOff(790, 790), null)
  assert.equal(percentOff(100, 0), null)
})

test("Bangkok datetime-local round trip", () => {
  const d = fromBangkokInput("2026-10-31T23:59")
  assert.equal(d?.toISOString(), "2026-10-31T16:59:00.000Z")
  assert.equal(toBangkokInput(d), "2026-10-31T23:59")
  assert.equal(fromBangkokInput(""), null)
  assert.equal(fromBangkokInput("garbage"), null)
})
