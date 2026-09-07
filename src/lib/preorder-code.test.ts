import assert from "node:assert/strict"
import test from "node:test"

import {
  PREORDER_CODE_ALPHABET,
  PREORDER_CODE_LENGTH,
  generatePreorderCode,
  normalizePreorderCode,
} from "./preorder-code"

test("generatePreorderCode produces the expected shape", () => {
  const code = generatePreorderCode()
  assert.match(code, /^PO-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/)
  assert.equal(code.length, 3 + PREORDER_CODE_LENGTH)
})

test("generatePreorderCode only ever uses the declared alphabet", () => {
  for (let i = 0; i < 200; i += 1) {
    const body = generatePreorderCode().slice(3)
    for (const ch of body) {
      assert.ok(PREORDER_CODE_ALPHABET.includes(ch), `unexpected character ${ch}`)
    }
  }
})

test("generatePreorderCode never emits the excluded characters in its body", () => {
  // The alphabet excludes 0, 1, I, and O specifically (it retains L) — see
  // the "WHY EXACTLY 32 SYMBOLS" comment in preorder-code.ts.
  for (let i = 0; i < 200; i += 1) {
    const body = generatePreorderCode().slice(3)
    assert.doesNotMatch(body, /[01IO]/)
  }
})

test("1000 draws are all distinct", () => {
  const codes = new Set<string>()
  for (let i = 0; i < 1000; i += 1) codes.add(generatePreorderCode())
  assert.equal(codes.size, 1000)
})

test("normalizePreorderCode accepts a canonical code unchanged", () => {
  assert.equal(normalizePreorderCode("PO-23456789AB"), "PO-23456789AB")
})

test("normalizePreorderCode accepts lowercase input", () => {
  assert.equal(normalizePreorderCode("po-23456789ab"), "PO-23456789AB")
})

test("normalizePreorderCode accepts a bare body with no prefix", () => {
  assert.equal(normalizePreorderCode("23456789AB"), "PO-23456789AB")
})

test("normalizePreorderCode accepts whitespace-padded / oddly-dashed input", () => {
  assert.equal(normalizePreorderCode("  po 2345-6789-ab  "), "PO-23456789AB")
})

test("normalizePreorderCode rejects the wrong length", () => {
  assert.equal(normalizePreorderCode("PO-2345"), null)
  assert.equal(normalizePreorderCode("PO-23456789ABC"), null)
})

test("normalizePreorderCode rejects characters outside the alphabet", () => {
  assert.equal(normalizePreorderCode("PO-0123456789"), null) // 0 and 1
  assert.equal(normalizePreorderCode("PO-IIOO456789"), null) // I and O
})

test("normalizePreorderCode rejects empty input", () => {
  assert.equal(normalizePreorderCode(""), null)
  assert.equal(normalizePreorderCode("   "), null)
})
