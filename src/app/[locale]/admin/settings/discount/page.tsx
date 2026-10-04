import { setRequestLocale } from "next-intl/server"

import { getShopSettings } from "@/db/queries/settings"
import { SaleSettings } from "@/components/settings/sale-settings"

export default async function DiscountSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getShopSettings()

  return (
    <SaleSettings
      initial={{
        enabled: settings.saleEnabled,
        percent: settings.salePercent,
        startsAt: settings.saleStartsAt?.toISOString() ?? null,
        endsAt: settings.saleEndsAt?.toISOString() ?? null,
        labelTh: settings.saleLabelTh ?? "",
        labelEn: settings.saleLabelEn ?? "",
      }}
    />
  )
}
