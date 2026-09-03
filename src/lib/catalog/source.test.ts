import assert from "node:assert/strict"
import test from "node:test"

import { canonicalizeSource, extractFirstUrl, isPrivateAddress } from "./source"

test("extracts a URL from multiline supplier share text", () => {
  assert.equal(
    extractFirstUrl("Product title\nhttps://th.shein.com/example-p-12345678.html?mallCode=1\nshared"),
    "https://th.shein.com/example-p-12345678.html?mallCode=1"
  )
})

test("canonicalizes supported suppliers and strips tracking", () => {
  assert.deepEqual(
    canonicalizeSource("https://th.shein.com/a-p-59190657.html?mallCode=1", "2"),
    {
      url: "https://th.shein.com/a-p-59190657.html",
      identity: "shein:59190657",
      supplier: "SHEIN",
    }
  )
  assert.equal(
    canonicalizeSource("https://www.amazon.com/name/dp/B0CS31YCSG?th=1", "70").url,
    "https://www.amazon.com/dp/B0CS31YCSG"
  )
  assert.equal(
    canonicalizeSource("https://detail.1688.com/offer/948096064291.html?spm=x", "76").url,
    "https://detail.1688.com/offer/948096064291.html"
  )
  assert.equal(
    canonicalizeSource("https://item.taobao.com/item.htm?id=983523638376&pisk=secret", "77").url,
    "https://item.taobao.com/item.htm?id=983523638376"
  )
})

test("rejects unsupported sources and recognizes private addresses", () => {
  assert.equal(canonicalizeSource("https://example.com/item/1", "9").url, null)
  for (const address of ["127.0.0.1", "10.2.3.4", "172.20.1.2", "192.168.1.5", "::1", "fd00::1"]) {
    assert.equal(isPrivateAddress(address), true)
  }
  assert.equal(isPrivateAddress("1.1.1.1"), false)
})
