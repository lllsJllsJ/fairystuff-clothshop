import { setRequestLocale } from "next-intl/server"

import {
  getCustomerStatusLabels,
  getOrderItemStatuses,
  getOrderStatusLabels,
} from "@/db/queries/settings"
import { OrderWorkflowSettings } from "@/components/settings/workflow-settings"

export default async function OrderSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [orderLabels, customerLabels, itemStatuses] = await Promise.all([
    getOrderStatusLabels(),
    getCustomerStatusLabels(),
    getOrderItemStatuses(),
  ])

  return (
    <OrderWorkflowSettings
      orderLabels={orderLabels}
      customerLabels={customerLabels}
      itemStatuses={itemStatuses}
    />
  )
}
