"use client"

import { useTranslations } from "next-intl"
import { Shirt } from "lucide-react"

import type { Session } from "next-auth"
import { Link, usePathname } from "@/i18n/navigation"
import { NAV_ITEMS } from "@/components/layout/nav-items"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { UserMenu } from "@/components/layout/user-menu"

export function Header({ user }: { user: Session["user"] }) {
  const t = useTranslations()
  const pathname = usePathname()

  const current = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )
  const title = current ? t(`nav.${current.labelKey}`) : t("app.name")

  return (
    <header className="sticky top-0 z-[var(--z-fixed)] flex h-16 items-center gap-2 border-b border-border bg-background px-4 shadow-[var(--shadow-raised-xs)] md:px-6">
      <Link href="/admin" className="flex items-center gap-2 md:hidden">
        <div className="flex size-8 items-center justify-center bg-primary text-primary-foreground">
          <Shirt className="size-4" />
        </div>
      </Link>

      <h1 className="text-h4 font-bold text-foreground">{title}</h1>

      <div className="ml-auto flex items-center gap-1">
        <LocaleToggle />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
