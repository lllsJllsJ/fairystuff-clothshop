import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { CartPage } from "@/components/cart/cart-page"

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CartRoute() {
  const t = await getTranslations("cart")
  return <><h1 className="sr-only">{t("title")}</h1><CartPage /></>
}
