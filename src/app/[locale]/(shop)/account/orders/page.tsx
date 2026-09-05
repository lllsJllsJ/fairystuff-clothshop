import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"

import { requireCustomer } from "@/lib/auth-helpers"
import { getCustomerOrders } from "@/db/queries/customer-orders"
import { getCustomerStatusLabels } from "@/db/queries/settings"
import { customerStageFor, customerStatusLabel } from "@/lib/order-status"
import { CustomerStatusBadge } from "@/components/account/customer-status-badge"
import { Link } from "@/i18n/navigation"
import { formatBaht, formatDate } from "@/lib/format"
import { signOutAction } from "@/components/auth/actions"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CustomerOrdersPage() {
  const user = await requireCustomer()
  const [orders, labels, locale, t] = await Promise.all([getCustomerOrders(user.id), getCustomerStatusLabels(), getLocale(), getTranslations("account")])
  return <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-h2 font-bold">{t("orders")}</h1>
      <form action={signOutAction}><Button type="submit" variant="outline">{t("signOut")}</Button></form>
    </div>
    {orders.length === 0 ? <p className="mt-6 text-body text-muted-foreground">{t("noOrders")}</p> : <div className="mt-6 space-y-3">
      {orders.map((order) => {
        const stage = customerStageFor(order.status)
        return <Link key={order.id} href={`/account/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-4 border border-border bg-card p-4 hover:shadow-sm">
          <div><p className="font-bold">{t("order", { number: order.orderNo })}</p><p className="text-small text-muted-foreground">{formatDate(order.orderDate)} · {formatBaht(Number(order.itemsTotal))}</p></div>
          <CustomerStatusBadge stage={stage} label={customerStatusLabel(stage, locale, labels)} />
        </Link>
      })}
    </div>}
  </div>
}
