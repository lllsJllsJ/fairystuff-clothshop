/**
 * Seeds the 13 Thai product types. Idempotent — safe to re-run;
 * existing rows (matched by unique `name`) are left untouched.
 *
 * Usage: npm run db:seed
 */
import { sql } from "drizzle-orm"

import { db } from "../src/db"
import { productTypes } from "../src/db/schema"

/**
 * `codePrefix` is the key product codes are built from — `TS` -> `TS-001`
 * (see src/lib/product-code.ts). Seeded explicitly rather than derived so
 * the curated ten get the obvious two letters (and so `Shirt`/`Shorts`
 * don't collide); types the owner adds later derive their own.
 */
const PRODUCT_TYPES: Array<{
  name: string
  nameEn: string
  slug: string
  codePrefix: string
  sortOrder: number
}> = [
  { name: "เสื้อยืด", nameEn: "T-Shirt", slug: "t-shirt", codePrefix: "TS", sortOrder: 1 },
  { name: "เสื้อเชิ้ต", nameEn: "Shirt", slug: "shirt", codePrefix: "SH", sortOrder: 2 },
  { name: "เสื้อครอป", nameEn: "Crop Top", slug: "crop-top", codePrefix: "CT", sortOrder: 3 },
  { name: "เดรส", nameEn: "Dress", slug: "dress", codePrefix: "DR", sortOrder: 4 },
  { name: "กระโปรง", nameEn: "Skirt", slug: "skirt", codePrefix: "SK", sortOrder: 5 },
  {
    name: "กางเกงขายาว",
    nameEn: "Trousers",
    slug: "trousers", codePrefix: "TR",
    sortOrder: 6,
  },
  { name: "กางเกงขาสั้น", nameEn: "Shorts", slug: "shorts", codePrefix: "SS", sortOrder: 7 },
  {
    name: "เสื้อคลุม",
    nameEn: "Outerwear",
    slug: "outerwear", codePrefix: "OW",
    sortOrder: 8,
  },
  { name: "เซ็ต", nameEn: "Set", slug: "set", codePrefix: "ST", sortOrder: 9 },
  {
    name: "เครื่องประดับ",
    nameEn: "Accessories",
    slug: "accessories", codePrefix: "AC",
    sortOrder: 10,
  },
  { name: "รองเท้า", nameEn: "Footwear", slug: "footwear", codePrefix: "FW", sortOrder: 11 },
  { name: "กระเป๋า", nameEn: "Bag", slug: "bag", codePrefix: "BG", sortOrder: 12 },
  { name: "ชุดกีฬา", nameEn: "Activewear", slug: "activewear", codePrefix: "AW", sortOrder: 13 },
]

async function main() {
  console.log(`Seeding ${PRODUCT_TYPES.length} product types...`)

  for (const type of PRODUCT_TYPES) {
    // Idempotent: an existing row keeps everything it has, but picks up a
    // codePrefix if it predates that column (nothing else is overwritten).
    await db
      .insert(productTypes)
      .values(type)
      .onConflictDoUpdate({
        target: productTypes.name,
        set: {
          codePrefix: sql`coalesce(${productTypes.codePrefix}, excluded.code_prefix)`,
        },
      })
  }

  console.log("Done.")
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Seed failed:", error)
    process.exit(1)
  })
