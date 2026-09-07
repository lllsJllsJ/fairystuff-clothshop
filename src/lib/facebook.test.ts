import assert from "node:assert/strict"
import test from "node:test"

import { isValidFacebookUrl, normalizeFacebookUrl } from "./facebook"

test("normalizes Facebook page addresses to HTTPS URLs", () => {
  assert.equal(normalizeFacebookUrl(" facebook.com/example.shop "), "https://facebook.com/example.shop")
  assert.equal(isValidFacebookUrl("https://www.facebook.com/example.shop"), true)
  assert.equal(isValidFacebookUrl("https://fb.com/example.shop"), true)
})

test("rejects unsafe or lookalike Facebook links", () => {
  assert.equal(isValidFacebookUrl("javascript:alert(1)"), false)
  assert.equal(isValidFacebookUrl("http://facebook.com/example.shop"), false)
  assert.equal(isValidFacebookUrl("https://facebook.com.evil.example/example.shop"), false)
})
