import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { verifyCatalogFiles } from "../src/lib/catalog/prepare"
import {
  assertCatalogApplyGuards,
  CATALOG_REPLACE_CONFIRMATION,
} from "../src/lib/catalog/guards"
import { validateCatalogManifest } from "../src/lib/catalog/schema"

function valueFor(flag: string, fallback?: string): string | undefined {
  const prefix = `${flag}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

async function main() {
  const manifestPath = resolve(valueFor("--manifest", "data/stock_fairystuff.catalog.json")!)
  const manifest = validateCatalogManifest(JSON.parse(await readFile(manifestPath, "utf8")))
  await verifyCatalogFiles(manifest)

  const apply = process.argv.includes("--apply")
  const replace = process.argv.includes("--replace")
  if (!apply) {
    console.log(`Dry run verified ${manifest.products.length} products; no database or object-storage writes were made.`)
    console.log(`To replace shop data, add --apply --replace --confirm='${CATALOG_REPLACE_CONFIRMATION}'.`)
    return
  }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is required")
  const { privateTarget } = assertCatalogApplyGuards({
    replace,
    confirmation: valueFor("--confirm"),
    databaseUrl,
    allowRemote: process.argv.includes("--allow-remote"),
  })
  console.log(`Replacing catalogue on ${new URL(databaseUrl).hostname} (${privateTarget ? "local/private" : "remote"})`)
  console.log(`Object bucket: ${process.env.R2_BUCKET ?? "(not set)"}`)

  const { replaceCatalog } = await import("../src/lib/catalog/import")
  const summary = await replaceCatalog(manifest)
  console.log(`Imported ${summary.products} active products, ${summary.variants} variants at quantity 99, and ${summary.images} images.`)
  console.log(`Uploaded ${summary.uploadedObjects} renditions; removed ${summary.removedOldImages} old image groups.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
