import assert from "node:assert/strict"
import test from "node:test"

import { catalogImageInserts, catalogVariantInsert } from "./import-plan"

test("plans one in-stock Free Size variant using the detected color", () => {
  assert.deepEqual(catalogVariantInsert("product", "ชมพู"), {
    productId: "product",
    color: "ชมพู",
    size: "Free Size",
    quantity: 99,
    sortOrder: 0,
  })
})

test("leaves the cover untagged and tags every other image with the exact variant color", () => {
  const rows = catalogImageInserts("product", "เสื้อแฟชั่น สีชมพู", "ชมพู", [
    { canonicalKey: "first-1600.webp", url: "https://images/first-1600.webp" },
    { canonicalKey: "second-1600.webp", url: "https://images/second-1600.webp" },
  ])
  assert.equal(rows[0].color, null)
  assert.equal(rows[1].color, "ชมพู")
  assert.ok(rows.every((row) => row.storageKey.endsWith("-1600.webp")))
})
