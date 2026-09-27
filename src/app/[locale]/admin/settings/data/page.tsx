import { setRequestLocale } from "next-intl/server"

import { DataTools } from "@/components/settings/data-tools"

export default async function DataSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <DataTools />
}
