import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { CheckCircle2 } from "lucide-react"

import { requireCustomer } from "@/lib/auth-helpers"
import { getCustomerOrderById } from "@/db/queries/customer-orders"
import { contactLinks, getShopSettings } from "@/db/queries/settings"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"
import { OrderIdCopy } from "@/components/checkout/order-id-copy"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CheckoutSuccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireCustomer()
  const [order, settings, t] = await Promise.all([getCustomerOrderById(id, user.id), getShopSettings(), getTranslations("checkout")])
  if (!order) notFound()
  const links = contactLinks(settings)
  return <div className="mx-auto max-w-xl px-4 py-17 text-center">
    <CheckCircle2 className="mx-auto size-14 text-primary" />
    <h1 className="mt-4 text-h2 font-bold">{t("received")}</h1>
    <p className="mt-3 text-body text-muted-foreground">{t("sendOrderId")}</p>
    <OrderIdCopy orderNo={order.orderNo} />
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      {links.lineUrl && <Button nativeButton={false} render={<a href={links.lineUrl} target="_blank" rel="noopener noreferrer" />}>LINE</Button>}
      {links.instagramUrl && <Button variant="outline" nativeButton={false} render={<a href={links.instagramUrl} target="_blank" rel="noopener noreferrer" />}>Instagram</Button>}
    </div>
    <Link href={`/account/orders/${order.id}`} className="mt-6 inline-block text-link hover:underline">{t("trackOrder")}</Link>
  </div>
}
