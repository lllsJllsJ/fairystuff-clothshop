import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { CartPage } from "@/components/cart/cart-page"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "cart" })
  return { title: t("title"), robots: { index: false, follow: false } }
}

export default async function CartRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Load-bearing: without it next-intl falls back to headers(), and this
  // never-prerendered route then 500s with DYNAMIC_SERVER_USAGE.
  setRequestLocale(locale)
  return <CartPage />
}
