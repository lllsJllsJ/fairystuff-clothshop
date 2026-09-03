import { getTranslations } from "next-intl/server"

import { getProductCodes } from "@/db/queries/products"
import { ProductImport } from "@/components/products/product-import"

export default async function ImportProductsPage() {
  const t = await getTranslations()
  const codes = await getProductCodes()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-h3 font-bold text-foreground">{t("import.title")}</h1>
        <p className="mt-1 text-body text-muted-foreground">{t("import.subtitle")}</p>
      </div>
      <ProductImport existingCodes={codes} />
    </div>
  )
}
