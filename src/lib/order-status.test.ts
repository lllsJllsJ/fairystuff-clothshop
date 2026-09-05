import assert from "node:assert/strict"
import test from "node:test"

import { customerStageFor } from "./order-status"

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
