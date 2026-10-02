import assert from "node:assert/strict"
import test from "node:test"

import { MAX_POPULAR_PRODUCTS } from "./product-taxonomy"
import {
  popularProductIdsSchema,
  productFormSchema,
  productImageSchema,
} from "./validations/product"

function validProduct() {
  return {
    productCode: "",
    productName: "เสื้อทดสอบ",
    productType: "เสื้อยืด",
    description: "",
    sellPrice: 590,
    originalPrice: 250,
    buyingSource: "",
    sourceLink: "",
    status: "active" as const,
    variants: [],
  }
}

test("create form accepts an empty asynchronous code preview", () => {
  assert.equal(productFormSchema.safeParse(validProduct()).success, true)
})

test("preorder lead time requires a complete, ascending day range", () => {
  assert.equal(productFormSchema.safeParse({ ...validProduct(), preorderMinDays: 7 }).success, false)
  assert.equal(productFormSchema.safeParse({ ...validProduct(), preorderMinDays: 21, preorderMaxDays: 14 }).success, false)
  assert.equal(productFormSchema.safeParse({ ...validProduct(), preorderMinDays: 14, preorderMaxDays: 21 }).success, true)
})

test("product image must use the same-origin URL for its exact storage key", () => {
  const storageKey =
    "products/123e4567-e89b-12d3-a456-426614174000/1750000000000-0-1600.webp"
  const image = { url: `/api/images/${storageKey}`, storageKey, sortOrder: 0 }

  assert.equal(productImageSchema.safeParse(image).success, true)
  assert.equal(
    productImageSchema.safeParse({ ...image, url: "https://example.com/untrusted.webp" }).success,
    false
  )
})

function uuid(n: number) {
  return `123e4567-e89b-42d3-a456-${String(n).padStart(12, "0")}`
}

test("popular list accepts an empty list and keeps the given order", () => {
  assert.deepEqual(popularProductIdsSchema.parse([]), [])
  assert.deepEqual(popularProductIdsSchema.parse([uuid(2), uuid(1)]), [uuid(2), uuid(1)])
})

test("popular list rejects duplicates, non-uuids, and more than the cap", () => {
  assert.equal(popularProductIdsSchema.safeParse([uuid(1), uuid(1)]).success, false)
  assert.equal(popularProductIdsSchema.safeParse(["TS-001"]).success, false)

  const atCap = Array.from({ length: MAX_POPULAR_PRODUCTS }, (_, i) => uuid(i))
  assert.equal(popularProductIdsSchema.safeParse(atCap).success, true)
  assert.equal(
    popularProductIdsSchema.safeParse([...atCap, uuid(MAX_POPULAR_PRODUCTS)]).success,
    false
  )
})
