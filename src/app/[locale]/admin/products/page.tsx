import { Suspense } from "react"

import { getProductTypes } from "@/db/queries/product-types"
import { ProductBrowser } from "@/components/products/product-browser"
import { titleMetadata } from "@/lib/page-metadata"

export const generateMetadata = titleMetadata("nav.products")

export default async function AdminProductsPage() {
  const types = await getProductTypes()

  return (
    <Suspense>
      <ProductBrowser types={types} />
    </Suspense>
  )
}
