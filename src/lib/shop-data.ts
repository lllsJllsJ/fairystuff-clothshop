import { sql } from "drizzle-orm"

import { db } from "@/db"
import { orderItems, orders, productImages, productVariants, products } from "@/db/schema"
import { deleteProductImageRenditions } from "@/lib/r2"

/** Clears transactional shop data while retaining users and product types. */
export async function clearAllData(): Promise<void> {
  const stored = await db.select({ storageKey: productImages.storageKey }).from(productImages)

  await db.transaction(async (tx) => {
    await tx.delete(orderItems)
    await tx.delete(orders)
    await tx.delete(productImages)
    await tx.delete(productVariants)
    await tx.delete(products)
    await tx.execute(sql`ALTER TABLE orders ALTER COLUMN order_no RESTART`)
  })

  await Promise.all(
    stored
      .map((row) => row.storageKey)
      .filter((key): key is string => Boolean(key))
      .map((key) =>
        deleteProductImageRenditions(key).catch((error) => {
          console.error("Failed to delete stored product renditions", key, error)
        })
      )
  )
}
