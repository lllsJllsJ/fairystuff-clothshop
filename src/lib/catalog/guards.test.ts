import assert from "node:assert/strict"
import test from "node:test"

import {
  assertCatalogApplyGuards,
  CATALOG_REPLACE_CONFIRMATION,
  isPrivateDatabaseTarget,
} from "./guards"

test("classifies local/private database targets", () => {
  assert.equal(isPrivateDatabaseTarget("postgres://u:p@localhost:5432/shop"), true)
  assert.equal(isPrivateDatabaseTarget("postgres://u:p@db.railway.internal:5432/shop"), true)
  assert.equal(isPrivateDatabaseTarget("postgres://u:p@192.168.1.5:5432/shop"), true)
  assert.equal(isPrivateDatabaseTarget("postgres://u:p@public.example.com:5432/shop"), false)
})

test("requires replacement, exact phrase, and an extra remote flag", () => {
  assert.throws(() => assertCatalogApplyGuards({
    replace: false,
    confirmation: CATALOG_REPLACE_CONFIRMATION,
    databaseUrl: "postgres://u:p@localhost/shop",
    allowRemote: false,
  }), /--replace/)
  assert.throws(() => assertCatalogApplyGuards({
    replace: true,
    confirmation: "almost",
    databaseUrl: "postgres://u:p@localhost/shop",
    allowRemote: false,
  }), /exactly equal/)
  assert.throws(() => assertCatalogApplyGuards({
    replace: true,
    confirmation: CATALOG_REPLACE_CONFIRMATION,
    databaseUrl: "postgres://u:p@public.example.com/shop",
    allowRemote: false,
  }), /--allow-remote/)
})
