import { getTranslations, setRequestLocale } from "next-intl/server"

import { SettingsNav } from "@/components/settings/settings-nav"

/**
 * Shared shell for every Settings sub-page: title + sub-menu. Owner gating
 * is inherited from `admin/layout.tsx` (and re-checked in every action).
 */
export default async function AdminSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("settings")

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-h3 font-bold text-foreground">{t("title")}</h1>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
        <aside className="md:sticky md:top-20 md:w-52 md:shrink-0">
          <SettingsNav />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
    </div>
  )
}
