"use client"

import { useTranslations } from "next-intl"
import { Shirt, Store } from "lucide-react"

import { cn } from "@/lib/utils"
import { Link, usePathname } from "@/i18n/navigation"
import { NAV_ITEMS } from "@/components/layout/nav-items"

/**
 * Admin sidebar — fuchsia bar, white text (DESIGN.md §4 Main Navigation
 * Bar). Uses the --sidebar-* tokens declared in globals.css, which already
 * carry the fuchsia/white pairing, so no ad-hoc colors here.
 */
export function Sidebar() {
  const t = useTranslations()
  const pathname = usePathname()

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex size-9 items-center justify-center bg-white/15">
          <Shirt className="size-5" />
        </div>
        <p className="text-subtitle font-bold">{t("app.name")}</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 border-b-2 border-transparent px-3 py-2.5 text-body font-medium transition-colors",
                active
                  ? "border-b-white bg-white/10"
                  : "hover:border-b-white hover:bg-white/10"
              )}
            >
              <Icon className="size-5" />
              {t(`nav.${item.labelKey}`)}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/15 px-3 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2.5 text-body font-medium transition-colors hover:bg-white/10"
        >
          <Store className="size-5" />
          {t("nav.viewShop")}
        </Link>
      </div>
    </aside>
  )
}
