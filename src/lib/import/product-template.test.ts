import assert from "node:assert/strict"
import test from "node:test"

import {
  createIssues,
  money,
  parseAudience,
  parseGrid,
  parseImageUrls,
  parseKind,
  parseVariants,
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  toTemplateRow,
  type ExportableProduct,
} from "./product-template"

const HEADER = TEMPLATE_COLUMNS.map((c) => TEMPLATE_HEADERS[c])

function row(values: Partial<Record<(typeof TEMPLATE_COLUMNS)[number], unknown>>): unknown[] {
  return TEMPLATE_COLUMNS.map((c) => values[c] ?? null)
}

test("multiple comma-separated image URLs: order kept, first = main, dupes dropped", () => {
  const { urls, invalid } = parseImageUrls(
    "https://a.com/1.jpg, https://a.com/2.jpg,https://a.com/1.jpg\nhttps://a.com/3.jpg"
  )
  assert.deepEqual(urls, ["https://a.com/1.jpg", "https://a.com/2.jpg", "https://a.com/3.jpg"])
  assert.equal(invalid, 0)
})

test("non-http image entries are counted as invalid", () => {
  assert.deepEqual(parseImageUrls("ftp://x/y.jpg, not-a-url, https://ok.com/a.png"), {
    urls: ["https://ok.com/a.png"],
    invalid: 2,
  })
})

test("colours x sizes cross product, with Colour/Size pairs switched off", () => {
  const variants = parseVariants("Pink, White", "90cm, 100cm", "White/100cm")
  assert.equal(variants?.length, 4)
  assert.deepEqual(
    variants?.filter((v) => !v.isAvailable).map((v) => `${v.color}/${v.size}`),
    ["White/100cm"]
  )
})

test("free-text sizes are kept verbatim; one-colour product uses '-'", () => {
  const variants = parseVariants(undefined, "3-4Y, One size", "One size")
  assert.deepEqual(variants, [
    { color: "-", size: "3-4Y", isAvailable: true },
    { color: "-", size: "One size", isAvailable: false },
  ])
})

test("blank colours AND sizes means 'leave variants as they are'", () => {
  assert.equal(parseVariants(undefined, "", undefined), undefined)
})

test("legacy packed cell: 'Free Size:2' stays one size; 'ดำ S:3' splits colour (converted to English)", () => {
  assert.deepEqual(parseVariants(undefined, "Free Size:2", undefined), [
    { color: "-", size: "Free Size", isAvailable: true },
  ])
  assert.deepEqual(parseVariants(undefined, "ดำ S:3, ดำ M:0", undefined), [
    { color: "Black", size: "S", isAvailable: true },
    { color: "Black", size: "M", isAvailable: true },
  ])
})

test("audience / kind accept Thai and English words", () => {
  assert.equal(parseAudience("เด็ก"), "kids")
  assert.equal(parseAudience("Adult"), "adult")
  assert.equal(parseAudience("both"), "both")
  assert.equal(parseAudience("ผู้ใหญ่และเด็ก"), "both")
  assert.equal(parseKind("Full Set"), "fullset")
  assert.equal(parseKind("เซ็ต"), "set")
  assert.equal(parseKind("bundle"), undefined)
})

test("money: blank is undefined, junk is null, '1,250 บาท' parses", () => {
  assert.equal(money(""), undefined)
  assert.equal(money("abc"), null)
  assert.equal(money("1,250 บาท"), 1250)
  assert.equal(money(-5), null)
})

test("parseGrid reads the exported headers and blank cells stay undefined", () => {
  const result = parseGrid([
    HEADER,
    row({ productCode: "TS-001", sellPrice: 450 }),
    row({ productName: "Bunny hoodie", kind: "set", imageUrls: "https://a.com/1.jpg, https://a.com/2.jpg" }),
  ])
  assert.ok(result.ok)
  if (!result.ok) return
  const [update, create] = result.rows
  assert.equal(update.productCode, "TS-001")
  assert.equal(update.sellPrice, 450)
  assert.equal(update.originalPrice, undefined) // blank = keep existing
  assert.equal(update.imageUrls, undefined) // blank = photos untouched
  assert.equal(update.variants, undefined)
  assert.deepEqual(create.imageUrls, ["https://a.com/1.jpg", "https://a.com/2.jpg"])
  assert.deepEqual(createIssues(create), []) // a set needs no type
})

test("a new single item without name or type is flagged", () => {
  const result = parseGrid([HEADER, row({ productCode: "", productName: "x" })])
  assert.ok(result.ok)
  if (!result.ok) return
  assert.deepEqual(createIssues(result.rows[0]), ["type_required"])
})

test("export -> import round-trips the same product", () => {
  const product: ExportableProduct = {
    productCode: "FULL-001",
    productName: "Bunny set",
    audience: "kids",
    kind: "fullset",
    productType: null,
    sellPrice: "590.00",
    originalPrice: "250.00",
    buyingSource: "1688",
    sourceLink: "https://detail.1688.com/offer/1.html",
    status: "active",
    description: "Soft",
    variants: [
      { color: "Pink", size: "90cm", isAvailable: true },
      { color: "Pink", size: "100cm", isAvailable: false },
    ],
    imageUrls: ["https://shop.example/api/images/products/x/a-1600.webp"],
  }
  const exported = toTemplateRow(product)
  const result = parseGrid([HEADER, TEMPLATE_COLUMNS.map((c) => exported[TEMPLATE_HEADERS[c]])])
  assert.ok(result.ok)
  if (!result.ok) return
  const parsed = result.rows[0]
  assert.equal(parsed.productCode, "FULL-001")
  assert.equal(parsed.audience, "kids")
  assert.equal(parsed.kind, "fullset")
  assert.equal(parsed.sellPrice, 590)
  assert.deepEqual(parsed.variants, product.variants)
  assert.deepEqual(parsed.imageUrls, product.imageUrls)
  assert.deepEqual(parsed.issues, [])
})
