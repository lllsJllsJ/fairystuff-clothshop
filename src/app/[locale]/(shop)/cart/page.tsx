import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { CartPage } from "@/components/cart/cart-page"

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CartRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Load-bearing: without it getTranslations() falls back to headers(), and
  // this never-prerendered route then 500s with DYNAMIC_SERVER_USAGE.
  setRequestLocale(locale)
  const t = await getTranslations("cart")
  return <><h1 className="sr-only">{t("title")}</h1><CartPage /></>
}
