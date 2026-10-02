import { setRequestLocale } from "next-intl/server"

import { getPopularProducts } from "@/db/queries/products"
import { getShopSettings } from "@/db/queries/settings"
import { BrandSettings } from "@/components/settings/brand-settings"
import { HeroSettings } from "@/components/settings/hero-settings"
import { PopularSettings } from "@/components/settings/popular-settings"
import { ShopContactsSettings } from "@/components/settings/workflow-settings"

export default async function StorefrontSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [settings, popular] = await Promise.all([getShopSettings(), getPopularProducts()])

  return (
    <>
      <BrandSettings settings={settings} />
      <HeroSettings settings={settings} />
      <PopularSettings initial={popular} />
      <ShopContactsSettings settings={settings} />
    </>
  )
}
