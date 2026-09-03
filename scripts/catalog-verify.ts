import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { verifyCatalogFiles } from "../src/lib/catalog/prepare"
import { validateCatalogManifest } from "../src/lib/catalog/schema"

function manifestArgument(): string {
  const prefix = "--manifest="
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? "data/stock_fairystuff.catalog.json"
}

async function main() {
  const manifestPath = resolve(manifestArgument())
  const manifest = validateCatalogManifest(JSON.parse(await readFile(manifestPath, "utf8")))
  await verifyCatalogFiles(manifest)
  const warningCount = manifest.products.reduce((total, product) => total + product.warnings.length, 0)
  const negativeMargins = manifest.products.filter((product) => product.sellPrice < product.originalPrice)
  console.log(`Verified ${manifest.products.length} active products and ${manifest.products.flatMap((product) => product.images).length} source images`)
  console.log(`Warnings: ${warningCount}; negative margins: ${negativeMargins.map((product) => `row ${product.workbookRow}`).join(", ") || "none"}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
