import { getTranslations } from "next-intl/server"

import { getProductsForArrange } from "@/db/queries/products"
import { BackLink } from "@/components/layout/back-link"
import { ProductArranger } from "@/components/products/product-arranger"

export default async function ArrangeProductsPage() {
  const t = await getTranslations()
  const products = await getProductsForArrange()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink fallbackHref="/admin/products" />
      <div>
        <h1 className="text-h3 font-bold text-foreground">{t("product.arrangeTitle")}</h1>
        <p className="mt-1 text-body text-muted-foreground">{t("product.arrangeHint")}</p>
      </div>
      <ProductArranger initial={products} />
    </div>
  )
}
