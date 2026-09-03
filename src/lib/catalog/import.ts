import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { sql } from "drizzle-orm"

import { db } from "@/db"
import {
  orderItems,
  orders,
  productImages,
  productTypes,
  productVariants,
  products,
  users,
} from "@/db/schema"
import { nextProductCodeIn } from "@/lib/product-code"
import {
  deleteProductImage,
  deleteProductImageRenditions,
  putProductImage,
} from "@/lib/r2"

import { catalogImageKey, renderImageRenditions } from "./images"
import { catalogImageInserts, catalogVariantInsert } from "./import-plan"
import { verifyCatalogFiles } from "./prepare"
import type { CatalogManifest } from "./schema"

const TYPE_ROWS = [
  ["เสื้อยืด", "T-Shirt", "t-shirt", "TS"],
  ["เสื้อเชิ้ต", "Shirt", "shirt", "SH"],
  ["เสื้อครอป", "Crop Top", "crop-top", "CT"],
  ["เดรส", "Dress", "dress", "DR"],
  ["กระโปรง", "Skirt", "skirt", "SK"],
  ["กางเกงขายาว", "Trousers", "trousers", "TR"],
  ["กางเกงขาสั้น", "Shorts", "shorts", "SS"],
  ["เสื้อคลุม", "Outerwear", "outerwear", "OW"],
  ["เซ็ต", "Set", "set", "ST"],
  ["เครื่องประดับ", "Accessories", "accessories", "AC"],
  ["รองเท้า", "Footwear", "footwear", "FW"],
  ["กระเป๋า", "Bag", "bag", "BG"],
  ["ชุดกีฬา", "Activewear", "activewear", "AW"],
] as const

type StagedProduct = {
  id: string
  source: CatalogManifest["products"][number]
  images: Array<{ canonicalKey: string; url: string; allKeys: string[] }>
}

export type CatalogImportSummary = {
  products: number
  variants: number
  images: number
  uploadedObjects: number
  removedOldImages: number
}

function publicBase(): string {
  const value = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/+$/, "")
  if (!value) throw new Error("NEXT_PUBLIC_R2_PUBLIC_URL is required for catalogue import")
  return value
}

async function stageManifest(manifest: CatalogManifest): Promise<{
  products: StagedProduct[]
  keys: string[]
}> {
  const base = publicBase()
  const staged: StagedProduct[] = []
  const keys: string[] = []

  try {
    for (const source of [...manifest.products].sort((a, b) => a.workbookRow - b.workbookRow)) {
      const id = randomUUID()
      const images: StagedProduct["images"] = []
      for (const [imageIndex, image] of source.images.entries()) {
        const input = await readFile(resolve(image.localPath))
        const renditions = await renderImageRenditions(input)
        const allKeys: string[] = []
        for (const rendition of renditions) {
          const key = catalogImageKey(id, imageIndex, rendition.width, image.sha256)
          await putProductImage(id, key, rendition.buffer)
          keys.push(key)
          allKeys.push(key)
        }
        const canonicalKey = allKeys.find((key) => key.endsWith("-1600.webp"))
        if (!canonicalKey) throw new Error(`Missing canonical rendition for row ${source.workbookRow}`)
        images.push({ canonicalKey, url: `${base}/${canonicalKey}`, allKeys })
      }
      staged.push({ id, source, images })
    }
    return { products: staged, keys }
  } catch (error) {
    await Promise.all(keys.map((key) => deleteProductImage(key).catch(() => undefined)))
    throw error
  }
}

/**
 * Stages every new object first, then replaces database rows atomically. A
 * transaction failure removes the staged objects; old objects are removed
 * only after the new database state commits.
 */
export async function replaceCatalog(manifest: CatalogManifest): Promise<CatalogImportSummary> {
  await verifyCatalogFiles(manifest)
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.role} = 'owner'`)
    .limit(1)
  if (!owner) throw new Error("An owner user is required before catalogue import")

  const oldImages = await db.select({ storageKey: productImages.storageKey }).from(productImages)
  const staged = await stageManifest(manifest)

  try {
    await db.transaction(async (tx) => {
      await tx.delete(orderItems)
      await tx.delete(orders)
      await tx.delete(productImages)
      await tx.delete(productVariants)
      await tx.delete(products)
      await tx.execute(sql`ALTER TABLE orders ALTER COLUMN order_no RESTART`)

      for (const [sortOrder, [name, nameEn, slug, codePrefix]] of TYPE_ROWS.entries()) {
        await tx
          .insert(productTypes)
          .values({ name, nameEn, slug, codePrefix, sortOrder })
          .onConflictDoUpdate({
            target: productTypes.name,
            set: {
              nameEn,
              slug,
              codePrefix: sql`coalesce(${productTypes.codePrefix}, ${codePrefix})`,
              sortOrder,
            },
          })
      }

      for (const product of staged.products) {
        const code = await nextProductCodeIn(tx, product.source.productType)
        if (!code) throw new Error(`Could not generate a code for ${product.source.productType}`)
        await tx.insert(products).values({
          id: product.id,
          productCode: code,
          productName: product.source.productName,
          productType: product.source.productType,
          description: product.source.description,
          sellPrice: product.source.sellPrice.toFixed(2),
          originalPrice: product.source.originalPrice.toFixed(2),
          buyingSource: product.source.buyingSource,
          sourceLink: product.source.sourceLink,
          status: product.source.status,
          createdBy: owner.id,
        })
        await tx.insert(productVariants).values(catalogVariantInsert(product.id, product.source.color))
        if (product.images.length > 0) {
          await tx.insert(productImages).values(
            catalogImageInserts(product.id, product.source.productName, product.source.color, product.images)
          )
        }
      }
    })
  } catch (error) {
    await Promise.all(staged.keys.map((key) => deleteProductImage(key).catch(() => undefined)))
    throw error
  }

  const oldKeys = oldImages
    .map((row) => row.storageKey)
    .filter((key): key is string => Boolean(key))
  await Promise.all(
    oldKeys.map((key) =>
      deleteProductImageRenditions(key).catch((error) => {
        console.error("Failed to remove old product renditions", key, error)
      })
    )
  )

  return {
    products: staged.products.length,
    variants: staged.products.length,
    images: staged.products.reduce((total, product) => total + product.images.length, 0),
    uploadedObjects: staged.keys.length,
    removedOldImages: oldKeys.length,
  }
}
