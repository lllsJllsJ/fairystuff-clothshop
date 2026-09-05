import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"

import { requireCustomer } from "@/lib/auth-helpers"
import { getCustomerOrderById } from "@/db/queries/customer-orders"
import { getCustomerStatusLabels } from "@/db/queries/settings"
import { customerStageFor, customerStatusLabel } from "@/lib/order-status"
import { CustomerStatusBadge } from "@/components/account/customer-status-badge"
import { formatBaht, formatDate } from "@/lib/format"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CustomerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireCustomer()
  const [order, labels, locale, t] = await Promise.all([getCustomerOrderById(id, user.id), getCustomerStatusLabels(), getLocale(), getTranslations("account")])
  if (!order) notFound()
  const stage = customerStageFor(order.status)
  const shipping = Number(order.shippingCost)
  return <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-h2 font-bold">{t("order", { number: order.orderNo })}</h1><p className="text-small text-muted-foreground">{formatDate(order.orderDate)}</p></div><CustomerStatusBadge stage={stage} label={customerStatusLabel(stage, locale, labels)} /></div>
    <section className="mt-6 border border-border bg-card p-5"><h2 className="font-bold">{t("items")}</h2><div className="mt-3 divide-y divide-border">{order.items.map((item) => <div key={item.id} className="flex justify-between gap-4 py-3"><div><p className="font-medium">{item.productName}</p><p className="text-small text-muted-foreground">{[item.color, item.size].filter(Boolean).join(" · ")} · × {item.quantity}</p></div><span>{formatBaht(Number(item.sellPrice) * item.quantity)}</span></div>)}</div>
      <div className="mt-4 space-y-2 border-t border-border pt-4 text-body"><div className="flex justify-between"><span>{t("subtotal")}</span><span>{formatBaht(Number(order.itemsTotal))}</span></div>{order.shippingConfirmedAt ? <><div className="flex justify-between"><span>{t("shipping")}</span><span>{formatBaht(shipping)}</span></div><div className="flex justify-between font-bold"><span>{t("total")}</span><span>{formatBaht(Number(order.itemsTotal) + shipping)}</span></div></> : <p className="text-small text-muted-foreground">{t("shippingPending")}</p>}</div>
    </section>
    <section className="mt-4 border border-border bg-card p-5"><h2 className="font-bold">{t("delivery")}</h2><p className="mt-2 text-body">{order.customerName}</p><p className="text-body">{order.customerPhone}</p><p className="whitespace-pre-line text-body text-muted-foreground">{order.customerAddress}</p></section>
  </div>
}
