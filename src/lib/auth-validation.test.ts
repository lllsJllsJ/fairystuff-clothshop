import assert from "node:assert/strict"
import test from "node:test"

import { loginSchema } from "./validations/auth"

/**
 * `signupSchema`, `profileSchema`, and `customerProfileSchema` were removed
 * from `validations/auth.ts` along with the `customer` role and public
 * registration (guest checkout needs no account at all — see CLAUDE.md).
 * This file used to test all four; only `loginSchema` survives here.
 */

test("loginSchema accepts a normalized email or phone identifier", () => {
  assert.equal(loginSchema.parse({ identifier: " Jane@Example.com ", password: "password123" }).identifier, "jane@example.com")
  assert.equal(loginSchema.parse({ identifier: "+66 81-234-5678", password: "password123" }).identifier, "+66812345678")
  assert.equal(loginSchema.safeParse({ identifier: "not-an-identifier", password: "password123" }).success, false)
})

test("loginSchema rejects a blank identifier or password", () => {
  assert.equal(loginSchema.safeParse({ identifier: "", password: "password123" }).success, false)
  assert.equal(loginSchema.safeParse({ identifier: "owner@example.com", password: "" }).success, false)
})
