import { getTranslations } from "next-intl/server"

import { Link } from "@/i18n/navigation"
import {
  BRAND_NAME,
  BRAND_TAGLINE_EN,
  BRAND_TAGLINE_TH,
} from "@/lib/brand"
import { contactLinks, getShopSettings } from "@/db/queries/settings"

/** DESIGN.md §4 "Footer Link": sky blue, hover darkens + underlines. */
export async function SiteFooter({ locale }: { locale: string }) {
  const [t, settings] = await Promise.all([getTranslations(), getShopSettings()])
  const links = contactLinks(settings)
  const tagline = locale === "th" ? BRAND_TAGLINE_TH : BRAND_TAGLINE_EN
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-muted">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-4 py-17 sm:grid-cols-3 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <p className="text-subtitle font-bold text-foreground">{BRAND_NAME}</p>
          <p className="text-body text-muted-foreground">{tagline}</p>
        </div>

        <nav aria-label={t("footer.quickLinks")} className="flex flex-col gap-2">
          <p className="text-small font-bold text-foreground">{t("footer.quickLinks")}</p>
          <FooterLink href="/">{t("nav.home")}</FooterLink>
          <FooterLink href="/shop">{t("nav.shop")}</FooterLink>
          <FooterLink href="/about">{t("nav.about")}</FooterLink>
        </nav>

        <div className="flex flex-col gap-2">
          <p className="text-small font-bold text-foreground">{t("footer.contact")}</p>
          {links.lineUrl && <a href={links.lineUrl} target="_blank" rel="noopener noreferrer" className="text-link hover:text-link-hover hover:underline">
            LINE: {settings.lineId}
          </a>}
          {links.instagramUrl && <a href={links.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-link hover:text-link-hover hover:underline">
            Instagram: @{settings.instagramHandle}
          </a>}
          {!links.lineUrl && !links.instagramUrl && <span className="text-body text-muted-foreground">—</span>}
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-[1440px] px-4 py-4 text-small text-muted-foreground sm:px-6 lg:px-8">
          {t("footer.rights", { year, brand: BRAND_NAME })}
        </div>
      </div>
    </footer>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-link hover:text-link-hover hover:underline">
      {children}
    </Link>
  )
}
