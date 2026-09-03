import { getTranslations } from "next-intl/server"

import { getProductTypes } from "@/db/queries/product-types"
import { OrderForm } from "@/components/orders/order-form"

export default async function NewOrderPage() {
  const t = await getTranslations()
  const types = await getProductTypes()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-h3 font-bold text-foreground">{t("order.newOrder")}</h1>
      <OrderForm types={types} />
    </div>
  )
}
