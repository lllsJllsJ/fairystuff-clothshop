import { setRequestLocale } from "next-intl/server"

import { getShopSettings } from "@/db/queries/settings"
import { BrandSettings } from "@/components/settings/brand-settings"
import { HeroSettings } from "@/components/settings/hero-settings"
import { ShopContactsSettings } from "@/components/settings/workflow-settings"

export default async function StorefrontSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getShopSettings()

  return (
    <>
      <BrandSettings settings={settings} />
      <HeroSettings settings={settings} />
      <ShopContactsSettings settings={settings} />
    </>
  )
}
