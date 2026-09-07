import assert from "node:assert/strict"
import test from "node:test"

import { customerStageFor, estimatedLeadTime, isActiveStage } from "./order-status"

test("internal order statuses map to the four normal customer stages", () => {
  assert.equal(customerStageFor("new"), "received")
  assert.equal(customerStageFor("accepted"), "preparing")
  assert.equal(customerStageFor("preorder"), "preparing")
  assert.equal(customerStageFor("packaging"), "preparing")
  assert.equal(customerStageFor("shipping"), "shipping")
  assert.equal(customerStageFor("complete"), "complete")
})

test("cancel and refund remain explicit exceptional customer stages", () => {
  assert.equal(customerStageFor("cancelled"), "cancelled")
  assert.equal(customerStageFor("refund"), "refunded")
})

test("isActiveStage accepts the four normal stages and rejects the two exceptions", () => {
  assert.equal(isActiveStage("received"), true)
  assert.equal(isActiveStage("preparing"), true)
  assert.equal(isActiveStage("shipping"), true)
  assert.equal(isActiveStage("complete"), true)
  assert.equal(isActiveStage("cancelled"), false)
  assert.equal(isActiveStage("refunded"), false)
})

test("estimatedLeadTime returns null when no item carries a lead-time range", () => {
  assert.equal(
    estimatedLeadTime([
      { preorderMinDays: null, preorderMaxDays: null },
      { preorderMinDays: null, preorderMaxDays: null },
    ]),
    null
  )
  assert.equal(estimatedLeadTime([]), null)
})

test("estimatedLeadTime takes the slowest item's range when only one item has an estimate", () => {
  assert.deepEqual(
    estimatedLeadTime([
      { preorderMinDays: null, preorderMaxDays: null },
      { preorderMinDays: 3, preorderMaxDays: 7 },
    ]),
    { min: 3, max: 7 }
  )
})

test("estimatedLeadTime takes the max across items independently for min and max", () => {
  // Item A is faster on the low end (min 2) but slower on the high end
  // (max 10); item B is the opposite. The order-level estimate takes the
  // bottleneck in each direction: max(2, 5) and max(10, 6).
  assert.deepEqual(
    estimatedLeadTime([
      { preorderMinDays: 2, preorderMaxDays: 10 },
      { preorderMinDays: 5, preorderMaxDays: 6 },
    ]),
    { min: 5, max: 10 }
  )
})
