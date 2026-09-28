import assert from "node:assert/strict"
import test from "node:test"

import { toEnglishColor } from "./colors"

test("Thai colour names become English", () => {
  assert.equal(toEnglishColor("ขาว"), "White")
  assert.equal(toEnglishColor(" ม่วง "), "Purple")
  assert.equal(toEnglishColor("หลายสี"), "Multicolor")
})

test("known English names take their canonical spelling", () => {
  assert.equal(toEnglishColor("purple"), "Purple")
  assert.equal(toEnglishColor("NAVY BLUE", ["Navy Blue"]), "Navy Blue")
})

test("unknown names are kept as typed, trimmed", () => {
  assert.equal(toEnglishColor(" Mint "), "Mint")
  assert.equal(toEnglishColor("-"), "-")
})
