import assert from "node:assert/strict"
import test from "node:test"

import { trackingUrlFor } from "./carriers"

test("known carrier builds an encoded tracking link", () => {
  assert.equal(
    trackingUrlFor("Thailand Post", "EF 123/TH"),
    "https://track.thailandpost.co.th/?trackNumber=EF%20123%2FTH"
  )
})

test("carrier match is case-insensitive", () => {
  assert.ok(trackingUrlFor("flash express", "TH1")?.includes("TH1"))
})

test("unknown carrier, carrier without a URL, or no number gives no link", () => {
  assert.equal(trackingUrlFor("My cousin's truck", "X1"), null)
  assert.equal(trackingUrlFor("J&T Express", "X1"), null)
  assert.equal(trackingUrlFor("Thailand Post", "  "), null)
  assert.equal(trackingUrlFor(null, "X1"), null)
})
