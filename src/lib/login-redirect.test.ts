import assert from "node:assert/strict"
import test from "node:test"

import { loginDestination } from "./login-redirect"

test("login returns storefront sign-ins to the page that initiated them", () => {
  assert.equal(loginDestination({ requestedRedirect: "/en", locale: "en", role: "staff" }), "/en")
  assert.equal(loginDestination({ requestedRedirect: "/th/cart", locale: "th", role: "staff" }), "/th/cart")
  assert.equal(loginDestination({ requestedRedirect: "/en/shop/AC-001", locale: "en", role: "owner" }), "/en/shop/AC-001")
})

test("login resumes an owner's admin flow", () => {
  assert.equal(loginDestination({ requestedRedirect: "/en/admin", locale: "en", role: "owner" }), "/en/admin")
  assert.equal(loginDestination({ requestedRedirect: "/en/admin/orders", locale: "en", role: "owner" }), "/en/admin/orders")
})

test("login rejects cross-locale, external, and role-forbidden redirects", () => {
  assert.equal(loginDestination({ requestedRedirect: "https://example.com", locale: "en", role: "staff" }), "/en")
  assert.equal(loginDestination({ requestedRedirect: "/th/cart", locale: "en", role: "staff" }), "/en")
  assert.equal(loginDestination({ requestedRedirect: "/en/admin", locale: "en", role: "staff" }), "/en")
})
