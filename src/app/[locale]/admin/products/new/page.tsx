import { getTranslations } from "next-intl/server"

import { getProductTypes } from "@/db/queries/product-types"
import { ProductForm } from "@/components/products/product-form"

export default async function NewProductPage() {
  const t = await getTranslations()
  const types = await getProductTypes()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-h3 font-bold text-foreground">{t("product.newProduct")}</h1>
      <ProductForm types={types} />
    </div>
  )
}
