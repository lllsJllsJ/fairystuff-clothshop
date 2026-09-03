"use client"

import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Link, usePathname } from "@/i18n/navigation"
import { NAV_ITEMS } from "@/components/layout/nav-items"

/**
 * Mobile bottom nav. No role split (there's only one admin role), so this
 * is a straightforward evenly-spaced row of the same NAV_ITEMS the sidebar
 * shows — no FAB, no left/right split like carstockpro's editor-only FAB.
 */
export function BottomNav() {
  const t = useTranslations()
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[var(--z-fixed)] border-t border-border bg-background md:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-small font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" />
              <span className="truncate">{t(`nav.${item.labelKey}`)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
