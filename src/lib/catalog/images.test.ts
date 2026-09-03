import assert from "node:assert/strict"
import test from "node:test"

import sharp from "sharp"

import { catalogImageKey, renderImageRenditions } from "./images"
import { productImageRenditionKeys } from "../product-image-keys"

test("renders valid WebP files at all three exact widths", async () => {
  const source = await sharp({
    create: { width: 1800, height: 2200, channels: 3, background: "#e8bfd0" },
  }).png().toBuffer()
  const renditions = await renderImageRenditions(source)
  assert.deepEqual(renditions.map((rendition) => rendition.width), [480, 800, 1600])
  for (const rendition of renditions) {
    const metadata = await sharp(rendition.buffer).metadata()
    assert.equal(metadata.format, "webp")
    assert.equal(metadata.width, rendition.width)
  }
})

test("uses deterministic keys and expands canonical keys to every cleanup sibling", () => {
  const canonical = catalogImageKey("product-id", 2, 1600, "a".repeat(64))
  assert.equal(canonical, "products/product-id/catalog-02-aaaaaaaaaaaa-1600.webp")
  assert.deepEqual(productImageRenditionKeys(canonical), [
    "products/product-id/catalog-02-aaaaaaaaaaaa-480.webp",
    "products/product-id/catalog-02-aaaaaaaaaaaa-800.webp",
    "products/product-id/catalog-02-aaaaaaaaaaaa-1600.webp",
  ])
})
