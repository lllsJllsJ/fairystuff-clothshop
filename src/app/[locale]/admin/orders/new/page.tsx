import { getTranslations } from "next-intl/server"

import { getProductTypes } from "@/db/queries/product-types"
import { OrderForm } from "@/components/orders/order-form"
import { getOrderStatusLabels } from "@/db/queries/settings"

export default async function NewOrderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations()
  const [types, statusLabels] = await Promise.all([getProductTypes(), getOrderStatusLabels()])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-h3 font-bold text-foreground">{t("order.newOrder")}</h1>
      <OrderForm types={types} statusLabels={statusLabels} locale={locale} />
    </div>
  )
}
