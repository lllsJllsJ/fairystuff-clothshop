import { setRequestLocale } from "next-intl/server"
import { CartPage } from "@/components/cart/cart-page"
import { NO_INDEX, titleMetadata } from "@/lib/page-metadata"

export const generateMetadata = titleMetadata("cart.title", NO_INDEX)

export default async function CartRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Load-bearing: without it next-intl falls back to headers(), and this
  // never-prerendered route then 500s with DYNAMIC_SERVER_USAGE.
  setRequestLocale(locale)
  return <CartPage />
}
