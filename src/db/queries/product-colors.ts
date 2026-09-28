import "server-only"

import { asc } from "drizzle-orm"

import { db } from "@/db"
import { productColors } from "@/db/schema"

export type ProductColor = typeof productColors.$inferSelect

export async function getProductColors(): Promise<ProductColor[]> {
  return db.select().from(productColors).orderBy(asc(productColors.sortOrder), asc(productColors.name))
}
