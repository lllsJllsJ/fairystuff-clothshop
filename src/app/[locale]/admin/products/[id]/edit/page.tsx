import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { getProductById } from "@/db/queries/products"
import { getProductTypes } from "@/db/queries/product-types"
import { getCharacters } from "@/db/queries/characters"
import { ProductForm } from "@/components/products/product-form"
import { BackLink } from "@/components/layout/back-link"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { id } = await params
  const t = await getTranslations()

  const [product, types, characters] = await Promise.all([
    getProductById(id),
    getProductTypes(),
    getCharacters(),
  ])
  if (!product) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink fallbackHref="/admin/products" />
      <h1 className="mt-3 mb-5 text-h3 font-bold text-foreground">{t("product.editProduct")}</h1>
      <ProductForm product={product} types={types} characters={characters} />
    </div>
  )
}
