import { Suspense } from "react"

import { getProductTypes } from "@/db/queries/product-types"
import { ProductBrowser } from "@/components/products/product-browser"

export default async function AdminProductsPage() {
  const types = await getProductTypes()

  return (
    <Suspense>
      <ProductBrowser types={types} />
    </Suspense>
  )
}
