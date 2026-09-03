import assert from "node:assert/strict"
import test from "node:test"

import { isProductImageKey, productImageUrl } from "./product-image-keys"

const key = "products/123e4567-e89b-12d3-a456-426614174000/catalog-00-abcdef123456-1600.webp"

test("builds a stable same-origin URL for a valid product image", () => {
  assert.equal(productImageUrl(key), `/api/images/${key}`)
  assert.equal(isProductImageKey(key), true)
})

test("rejects traversal and unsupported image keys", () => {
  assert.equal(isProductImageKey("products/../../secret"), false)
  assert.throws(() => productImageUrl("other/file.webp"), /Invalid product image key/)
})
