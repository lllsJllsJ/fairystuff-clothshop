import assert from "node:assert/strict"
import test from "node:test"

import { productFormSchema, productImageSchema } from "./validations/product"

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
