import { resolve } from "node:path"

import { prepareCatalog } from "../src/lib/catalog/prepare"

function valueFor(flag: string, fallback: string): string {
  const prefix = `${flag}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

async function main() {
  const workbookPath = resolve(valueFor("--workbook", "data/stock_fairystuff.xlsx"))
  const manifestPath = resolve(valueFor("--manifest", "data/stock_fairystuff.catalog.json"))
  const cacheDir = resolve(valueFor("--cache", "data/.catalog-cache"))
  const offline = process.argv.includes("--offline")
  const imageOverrides = new Map<number, string[]>()
  for (const argument of process.argv.filter((value) => value.startsWith("--image="))) {
    const match = argument.slice("--image=".length).match(/^(\d+):(.+)$/)
    if (!match) throw new Error("Image overrides use --image=<workbook-row>:<local-path>")
    const row = Number(match[1])
    imageOverrides.set(row, [...(imageOverrides.get(row) ?? []), resolve(match[2])])
  }

  console.log(`Preparing ${workbookPath}`)
  console.log(`Supplier enrichment: ${offline ? "offline (workbook fallback only)" : "enabled"}`)
  const manifest = await prepareCatalog({ workbookPath, manifestPath, cacheDir, offline, imageOverrides })
  const supplierImages = manifest.products.flatMap((product) => product.images).filter((image) => image.provenance === "supplier").length
  const workbookImages = manifest.products.flatMap((product) => product.images).filter((image) => image.provenance === "workbook").length
  const reviewedImages = manifest.products.flatMap((product) => product.images).filter((image) => image.provenance === "reviewed").length
  console.log(`Prepared ${manifest.products.length} active products (${supplierImages} supplier, ${workbookImages} workbook, ${reviewedImages} reviewed images)`)
  console.log(`Review manifest: ${manifestPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
