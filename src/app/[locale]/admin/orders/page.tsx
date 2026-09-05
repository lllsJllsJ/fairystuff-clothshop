import { Suspense } from "react"

import { OrderList } from "@/components/orders/order-list"
import { getOrderStatusLabels } from "@/db/queries/settings"

export default async function AdminOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const statusLabels = await getOrderStatusLabels()
  return (
    <Suspense>
      <OrderList statusLabels={statusLabels} locale={locale} />
    </Suspense>
  )
}
