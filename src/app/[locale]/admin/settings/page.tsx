import { getTranslations, setRequestLocale } from "next-intl/server"

import { getProductTypes } from "@/db/queries/product-types"
import { ProductTypeManager } from "@/components/settings/product-type-manager"
import { DataTools } from "@/components/settings/data-tools"
import { getCharacters } from "@/db/queries/characters"
import { getCustomerStatusLabels, getOrderItemStatuses, getOrderStatusLabels, getShopSettings } from "@/db/queries/settings"
import { WorkflowSettings } from "@/components/settings/workflow-settings"

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("settings")
  const [types, settings, characters, orderLabels, customerLabels, itemStatuses] = await Promise.all([
    getProductTypes(), getShopSettings(), getCharacters(), getOrderStatusLabels(), getCustomerStatusLabels(), getOrderItemStatuses(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h3 font-bold text-foreground">{t("title")}</h1>
      <ProductTypeManager types={types} />
      <WorkflowSettings settings={settings} characters={characters} orderLabels={orderLabels} customerLabels={customerLabels} itemStatuses={itemStatuses} />
      <DataTools />
    </div>
  )
}
