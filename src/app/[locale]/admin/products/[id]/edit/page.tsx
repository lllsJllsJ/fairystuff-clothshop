import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { getProductById } from "@/db/queries/products"
import { getProductTypes } from "@/db/queries/product-types"
import { ProductForm } from "@/components/products/product-form"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { id } = await params
  const t = await getTranslations()

  const [product, types] = await Promise.all([getProductById(id), getProductTypes()])
  if (!product) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-h3 font-bold text-foreground">{t("product.editProduct")}</h1>
      <ProductForm product={product} types={types} />
    </div>
  )
}
