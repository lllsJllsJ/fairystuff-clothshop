import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { resolve } from "node:path"

import { validateCatalogManifest } from "./schema"
import { readWorkbookCatalog } from "./workbook"

const workbookPath = resolve("data/stock_fairystuff.xlsx")

test("extracts exactly the 53 complete reviewed workbook rows", () => {
  const rows = readWorkbookCatalog(workbookPath)
  assert.equal(rows.length, 53)
  assert.equal(rows.filter((row) => row.workbookRef === "SS010").length, 1)

  const first = rows.find((row) => row.row === 2)
  assert.equal(first?.originalPrice, 29)
  assert.equal(first?.sellPrice, 290)

  const formulaSet = rows.find((row) => row.row === 55)
  assert.equal(formulaSet?.originalPrice, 598)
  assert.equal(formulaSet?.sellPrice, 1280)
  assert.equal(formulaSet?.originalPriceFormula, "E54+E53")
  assert.equal(formulaSet?.images.length, 2)
})

test("generated review manifest retains audit refs but has no application-code field", async () => {
  const manifest = validateCatalogManifest(
    JSON.parse(await readFile(resolve("data/stock_fairystuff.catalog.json"), "utf8"))
  )
  assert.equal(manifest.products.length, 53)
  assert.ok(manifest.products.every((product) => product.status === "active"))
  assert.ok(manifest.products.every((product) => !("productCode" in product)))
  assert.equal(manifest.products.find((product) => product.workbookRow === 36)?.color, "หลายสี")

  const negative = manifest.products.find((product) => product.workbookRow === 77)
  assert.ok(negative)
  assert.equal(negative.sellPrice - negative.originalPrice, -110)
  assert.equal(negative.imagePolicy, "temporary-none")
  assert.equal(negative.images.length, 0)
  assert.ok(negative.warnings.some((warning) => warning === "NEGATIVE MARGIN: -110"))
  assert.ok(negative.warnings.some((warning) => warning.startsWith("TEMPORARY NO IMAGE:")))
})
