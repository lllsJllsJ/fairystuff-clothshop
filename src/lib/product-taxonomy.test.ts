import assert from "node:assert/strict"
import test from "node:test"

import { audiencesMatching, isAudienceFilter, isProductAudience } from "./product-taxonomy"

test("an Adults & Kids product matches both storefront tabs", () => {
  assert.deepEqual(audiencesMatching("kids"), ["kids", "both"])
  assert.deepEqual(audiencesMatching("adult"), ["adult", "both"])
})

test("'both' is a product audience but not a shopper filter value", () => {
  assert.equal(isProductAudience("both"), true)
  assert.equal(isAudienceFilter("both"), false)
  assert.equal(isAudienceFilter("kids"), true)
})
