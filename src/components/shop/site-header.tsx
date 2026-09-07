"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { Globe, Menu, Shirt, ShoppingBag } from "lucide-react"

import { cn } from "@/lib/utils"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import type { Locale } from "@/i18n/request"
import { Button } from "@/components/ui/button"
import { useCart } from "@/components/cart/cart-provider"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const NAV_LINKS = [
  { href: "/", labelKey: "nav.home" },
  { href: "/shop", labelKey: "nav.shop" },
  { href: "/about", labelKey: "nav.about" },
  { href: "/track", labelKey: "nav.track" },
] as const

/**
 * DESIGN.md §4 Main Navigation Bar: fuchsia background, white text,
 * `z-[var(--z-fixed)]`, `--shadow-raised-xs`. Links get a white underline
 * on hover/active — not the shared `LocaleToggle`/`Header` from
 * `components/layout` (those are styled for the admin's white surface and
 * would read as invisible fuchsia-on-fuchsia here), so the locale switch
 * is reimplemented inline against a white palette.
 *
 * No account menu here anymore — the storefront has no customer accounts
 * (guest checkout; see CLAUDE.md). `useSession()` was removed along with it,
 * since it existed only to drive the account menu's signed-in state.
 *
 * `brandName`/`logoUrl` come from the server parent (ShopLayout), which
 * reads `shop_settings` — a client component can't call the DB-backed
 * `getShopSettings()` itself. `logoUrl` is optional: an unconfigured shop
 * keeps the plain Shirt icon instead of an empty image slot.
 */
export function SiteHeader({
  brandName,
  logoUrl,
}: {
  brandName: string
  logoUrl?: string | null
}) {
  const t = useTranslations()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { count } = useCart()

  return (
    <header className="sticky top-0 z-[var(--z-fixed)] bg-primary shadow-[var(--shadow-raised-xs)]">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
        >
          {logoUrl ? (
            <Image src={logoUrl} alt="" width={28} height={28} className="size-7 object-contain" />
          ) : (
            <Shirt className="size-6" aria-hidden />
          )}
          <span className="text-subtitle font-bold">{brandName}</span>
        </Link>

        <nav aria-label={t("nav.mainNavigation")} className="ml-4 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 items-center border-b-2 px-4 text-link text-white transition-colors hover:bg-white/10",
                  active ? "border-white" : "border-transparent"
                )}
              >
                {t(link.labelKey)}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={<Link href="/cart" />}
            aria-label={t("nav.cart")}
            className="relative text-white hover:bg-white/10 hover:text-white"
          >
            <ShoppingBag />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Button>
          <HeaderLocaleToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("nav.menu")}
            onClick={() => setOpen(true)}
            className="text-white hover:bg-white/10 hover:text-white md:hidden"
          >
            <Menu />
          </Button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>{brandName}</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-1 flex-col gap-1 px-2">
            {NAV_LINKS.map((link) => (
              <SheetClose key={link.href} render={<Link href={link.href} />}>
                <span
                  className={cn(
                    "flex min-h-11 items-center px-3 text-link text-foreground hover:bg-muted",
                    pathname === link.href && "font-bold text-primary"
                  )}
                >
                  {t(link.labelKey)}
                </span>
              </SheetClose>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  )
}

function HeaderLocaleToggle() {
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next: Locale = locale === "th" ? "en" : "th"
    startTransition(() => {
      router.replace(pathname, { locale: next })
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={pending}
      aria-label="Toggle language"
      className="gap-1.5 text-white hover:bg-white/10 hover:text-white"
    >
      <Globe className="size-4" />
      <span className="font-medium">{locale === "th" ? "TH" : "EN"}</span>
    </Button>
  )
}
