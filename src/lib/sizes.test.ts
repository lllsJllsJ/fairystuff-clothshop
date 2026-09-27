import assert from "node:assert/strict"
import test from "node:test"

import { isPresetSize, normalizeSizes, sizePresetsFor, sortSizes } from "./sizes"

test("presets follow the audience", () => {
  assert.equal(sizePresetsFor("adult")[0], "XS")
  assert.equal(sizePresetsFor("kids")[0], "80cm")
  assert.equal(sizePresetsFor("kids").at(-1), ">150cm")
})

test("an Adults & Kids product offers both preset lists, adult first", () => {
  const presets = sizePresetsFor("both")
  assert.equal(presets[0], "XS")
  assert.ok(presets.includes("Free Size") && presets.includes("80cm") && presets.includes(">150cm"))
})

test("sortSizes puts presets in index order and keeps custom sizes after, in given order", () => {
  assert.deepEqual(sortSizes(["L", "3-4Y", "S", "One size", "M"]), ["S", "M", "L", "3-4Y", "One size"])
  assert.deepEqual(sortSizes([">150cm", "100cm", "80cm"]), ["80cm", "100cm", ">150cm"])
})

test("sortSizes is case-insensitive for presets and returns a new array", () => {
  const input = ["xl", "xs"]
  const out = sortSizes(input)
  assert.deepEqual(out, ["xs", "xl"])
  assert.notEqual(out, input)
})

test("normalizeSizes trims, drops blanks, dedupes case-insensitively", () => {
  assert.deepEqual(normalizeSizes([" M ", "", "m", "US 7"]), ["M", "US 7"])
})

test("custom sizes are free text, not presets", () => {
  assert.equal(isPresetSize("Free Size"), true)
  assert.equal(isPresetSize("Head 52cm"), false)
})
