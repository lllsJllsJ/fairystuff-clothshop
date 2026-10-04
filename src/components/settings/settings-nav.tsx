"use client"

import { useTranslations } from "next-intl"
import { Database, ListChecks, Percent, Store, Tags, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Link, usePathname } from "@/i18n/navigation"

type SettingsNavItem = {
  href: string
  /** key under the `settings` message namespace */
  labelKey: string
  icon: LucideIcon
}

/** One entry per `admin/settings/<section>/page.tsx`. */
export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { href: "/admin/settings/storefront", labelKey: "navStorefront", icon: Store },
  { href: "/admin/settings/discount", labelKey: "navDiscount", icon: Percent },
  { href: "/admin/settings/catalog", labelKey: "navCatalog", icon: Tags },
  { href: "/admin/settings/orders", labelKey: "navOrders", icon: ListChecks },
  { href: "/admin/settings/data", labelKey: "navData", icon: Database },
]

/**
 * Settings sub-menu. A vertical list beside the content from `md` up; a
 * horizontally scrollable tab strip on phones, where the admin's bottom nav
 * has no room for a nested menu.
 */
export function SettingsNav() {
  const t = useTranslations("settings")
  const pathname = usePathname()

  return (
    <nav aria-label={t("title")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 border-b border-border md:flex-col md:border-b-0">
        {SETTINGS_NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-body font-medium whitespace-nowrap transition-colors md:mb-0 md:border-b-0 md:border-l-2",
                  active
                    ? "border-primary text-primary md:bg-primary/5"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {t(item.labelKey)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
