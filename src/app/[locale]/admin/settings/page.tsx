import { getTranslations, setRequestLocale } from "next-intl/server"

import { getProductTypes } from "@/db/queries/product-types"
import { ProductTypeManager } from "@/components/settings/product-type-manager"
import { DataTools } from "@/components/settings/data-tools"

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("settings")
  const types = await getProductTypes()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h3 font-bold text-foreground">{t("title")}</h1>
      <ProductTypeManager types={types} />
      <DataTools />
    </div>
  )
}
