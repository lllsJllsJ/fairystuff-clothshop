import assert from "node:assert/strict"
import test from "node:test"

import { costVariance, formatVariance } from "./cost-variance"

const baht = (value: number) => `฿${value}`

test("over master is positive with a percentage", () => {
  const v = costVariance(135, 120)
  assert.deepEqual(v, { diff: 15, percent: 12.5, tone: "over" })
  assert.equal(formatVariance(v, baht), "+฿15 (+12.5%)")
})

test("under master is negative", () => {
  const v = costVariance(110, 120)
  assert.equal(v.tone, "under")
  assert.equal(formatVariance(v, baht), "−฿10 (−8.3%)")
})

test("no master baseline has no percentage", () => {
  const v = costVariance(50, 0)
  assert.equal(v.percent, null)
  assert.equal(formatVariance(v, baht), "+฿50")
})

test("equal is 'same'", () => {
  assert.equal(costVariance(99.99, 99.99).tone, "same")
})
