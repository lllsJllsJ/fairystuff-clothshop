import { Suspense } from "react"

import { OrderList } from "@/components/orders/order-list"

export default function AdminOrdersPage() {
  return (
    <Suspense>
      <OrderList />
    </Suspense>
  )
}
