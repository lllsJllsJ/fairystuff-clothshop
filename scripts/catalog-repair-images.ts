import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { Pool } from "pg"

import { renderImageRenditions } from "../src/lib/catalog/images"
import { validateCatalogManifest } from "../src/lib/catalog/schema"
import { productImageRenditionKeys } from "../src/lib/product-image-keys"
import { putProductImage } from "../src/lib/r2"

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is required")

  const manifest = validateCatalogManifest(
    JSON.parse(await readFile(resolve("data/stock_fairystuff.catalog.json"), "utf8"))
  )
  const sources = new Map(
    manifest.products.flatMap((product) =>
      product.images.map((image) => [image.sha256.slice(0, 12), image.localPath] as const)
    )
  )

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    const result = await pool.query<{ storage_key: string }>(
      "select storage_key from product_images where storage_key like 'products/%/catalog-%-1600.webp'"
    )
    let uploaded = 0
    for (const { storage_key: canonicalKey } of result.rows) {
      const match = canonicalKey.match(
        /^products\/([0-9a-f-]{36})\/catalog-\d+-([a-f0-9]{12})-1600\.webp$/
      )
      if (!match) continue
      const [, productId, shortHash] = match
      const localPath = sources.get(shortHash)
      if (!localPath) throw new Error(`No reviewed source image matches ${canonicalKey}`)

      const renditions = await renderImageRenditions(await readFile(resolve(localPath)))
      const keys = productImageRenditionKeys(canonicalKey)
      for (const rendition of renditions) {
        const key = keys.find((candidate) => candidate.endsWith(`-${rendition.width}.webp`))
        if (!key) throw new Error(`No ${rendition.width}px key for ${canonicalKey}`)
        await putProductImage(productId, key, rendition.buffer)
        uploaded += 1
      }
    }
    console.log(`Repaired ${uploaded} image renditions for ${result.rows.length} database images.`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
