import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { ArrowUp, Shirt } from "lucide-react"

import { Link } from "@/i18n/navigation"
import { getShopSettings, resolvedBrandDescription, resolvedBrandName } from "@/db/queries/settings"
import { ContactBand } from "@/components/shop/contact-cta"

type FooterHref = string | { pathname: string; query: Record<string, string> }

/**
 * The close of every storefront page, all in brand pink (no grey surface):
 * the contact band (the only place the channel logos appear), then a deeper
 * pink strip with the brand and the Shop / Help links, then the copyright
 * bar. White text throughout, underline on hover, visible focus rings.
 */
export async function SiteFooter({ locale }: { locale: string }) {
  const [t, settings] = await Promise.all([getTranslations(), getShopSettings()])
  const brandName = resolvedBrandName(settings)
  const tagline = resolvedBrandDescription(settings, locale)
  const year = new Date().getFullYear()

  const shopLinks: { href: FooterHref; label: string }[] = [
    { href: "/shop", label: t("shop.allProducts") },
    { href: { pathname: "/shop", query: { audience: "adult" } }, label: t("shop.audienceAdult") },
    { href: { pathname: "/shop", query: { audience: "kids" } }, label: t("shop.audienceKids") },
    { href: { pathname: "/shop", query: { kind: "sets" } }, label: t("shop.setsOnly") },
  ]
  const helpLinks: { href: FooterHref; label: string }[] = [
    { href: "/track", label: t("nav.track") },
    { href: "/about", label: t("nav.about") },
    { href: "/cart", label: t("nav.cart") },
  ]

  return (
    <footer className="text-white">
      <ContactBand settings={settings} locale={locale} />

      <div className="bg-[var(--footer-bg)]">
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.6fr_1fr_1fr] lg:gap-12 lg:px-8">
          <div className="col-span-2 flex flex-col items-start gap-3 lg:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <span className="flex size-10 items-center justify-center bg-white" style={{ borderRadius: "var(--radius-badge-sm)" }}>
                {settings.logoUrl ? (
                  <Image src={settings.logoUrl} alt="" width={28} height={28} className="size-7 object-contain" />
                ) : (
                  <Shirt className="size-5 text-primary" aria-hidden />
                )}
              </span>
              <span className="text-h4 font-bold">{brandName}</span>
            </Link>
            <p className="max-w-xs text-body text-white">{tagline}</p>
          </div>

          <FooterColumn title={t("footer.shopHeading")} links={shopLinks} />
          <FooterColumn title={t("footer.helpHeading")} links={helpLinks} />
        </div>
      </div>

      <div className="bg-[var(--footer-bar)]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-4 text-small text-white sm:px-6 lg:px-8">
          <span>{t("footer.rights", { year, brand: brandName })}</span>
          <a
            href="#"
            className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t("footer.backToTop")}
            <ArrowUp className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: { href: FooterHref; label: string }[] }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-small font-bold">
        <span aria-hidden className="h-0.5 w-5 bg-white/70" />
        {title}
      </p>
      <ul className="flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-body text-white underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
