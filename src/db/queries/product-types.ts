import "server-only"

import { asc } from "drizzle-orm"

import { db } from "@/db"
import { productTypes } from "@/db/schema"

/**
 * The managed product-type reference list backing `/admin/settings` and
 * the `CreatableCombobox` on the product form. Flattened from carstockpro's
 * `services/brands.ts` (brand -> model -> sub-model, 3 levels) to a single
 * level — clothing types don't nest the way car brands/models do.
 *
 * `products.productType` itself stays free text (carstockpro's brand
 * pattern): this table only holds the curated suggestion list, and
 * `lib/reference.ts#learnProductType` folds newly typed values into it.
 */

export type ProductType = typeof productTypes.$inferSelect

/** All product types, ordered for display (sortOrder, then name). */
export async function getProductTypes(): Promise<ProductType[]> {
  return db
    .select()
    .from(productTypes)
    .orderBy(asc(productTypes.sortOrder), asc(productTypes.name))
}
