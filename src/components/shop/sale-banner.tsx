import { getTranslations } from "next-intl/server"
import { ArrowRight } from "lucide-react"

import { Link } from "@/i18n/navigation"
import type { ShopSale } from "@/lib/pricing"
import { SaleCountdownTiles } from "@/components/shop/sale-countdown"

/** Server render runs in UTC on Railway — pin the shop's own timezone. */
function formatBangkok(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso))
}

/** Repeats of the ticker phrase per half — enough to overfill a 1920px row. */
const TICKER_REPEATS = 6

/**
 * Home-page band shown while the shop-wide sale (Settings -> Discount) is
 * running. An owner-set label (e.g. "11.11 MEGA SALE") replaces the
 * default "SALE" in the ticker and leads the headline as a tag. Deliberately compact (it sits above the hero): one row with
 * "20% OFF EVERYTHING", small countdown tiles when the sale has an end
 * date, and a white CTA to the Sale-filtered catalogue — then the scrolling
 * ticker strip (static under prefers-reduced-motion). The striped texture
 * is decorative.
 *
 * Server-rendered from the same activeShopSale() the pricing uses; ISR may
 * show it up to one revalidate window late, which checkout's re-pricing
 * makes harmless.
 */
export async function SaleBanner({
  sale,
  locale,
  label,
}: {
  sale: ShopSale
  locale: string
  /** Owner's custom label (Settings -> Discount); null = default "SALE". */
  label: string | null
}) {
  const t = await getTranslations("home")
  const endsAt = sale.endsAt?.toISOString() ?? null
  const percent = `${sale.percent}%`
  const title = t("saleBannerTitle", { label: label ?? t("saleBannerDefaultLabel"), percent: sale.percent })
  const tickerItems = Array.from({ length: TICKER_REPEATS }, (_, i) => i)
  // Wide letter-spacing suits Latin caps but tears Thai words apart.
  const wide = locale === "th" ? "" : "tracking-[0.2em] uppercase"
  const caps = locale === "th" ? "" : "tracking-wide uppercase"

  return (
    <section
      aria-labelledby="sale-banner-heading"
      className="relative isolate overflow-hidden bg-sale text-sale-foreground"
    >
      {/* Decorative texture: fine diagonal stripes. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 14px)",
        }}
      />

      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <h2 id="sale-banner-heading" className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="sr-only">{title}</span>
          {label && (
            <span aria-hidden className={`self-center bg-sale-foreground px-2 py-0.5 text-small font-bold text-sale ${caps}`}>
              {label}
            </span>
          )}
          {/* Thai reads "ลด 20% ทุกชิ้นทั้งร้าน"; English "20% OFF EVERYTHING". */}
          {locale === "th" && (
            <span aria-hidden className="text-body font-bold">
              {t("saleBannerOff")}
            </span>
          )}
          <span aria-hidden className="text-h3 leading-none font-bold tracking-tight sm:text-h2">
            {percent}
          </span>
          <span aria-hidden className={`text-body font-bold ${caps}`}>
            {locale === "th" ? t("saleBannerEverything") : `${t("saleBannerOff")} ${t("saleBannerEverything")}`}
          </span>
        </h2>

        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start sm:gap-5">
          {endsAt && (
            <div className="flex items-center gap-3">
              <p className="hidden flex-col text-small leading-tight sm:flex">
                <span className={`font-bold ${caps}`}>{t("saleBannerEndsIn")}</span>
                <span className="opacity-80">{t("saleBannerUntil", { date: formatBangkok(endsAt, locale) })}</span>
              </p>
              <SaleCountdownTiles endsAt={endsAt} labelClassName={caps} />
            </div>
          )}

          <Link
            href={{ pathname: "/shop", query: { sale: "1" } }}
            className="group inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 bg-sale-foreground px-3 text-small sm:px-4 font-bold text-sale transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sale-foreground active:translate-y-0"
          >
            {t("saleBannerCta")}
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Ticker: two identical halves scrolled by -50% for a seamless loop. */}
      <div aria-hidden className="overflow-hidden border-t border-sale-foreground/20 bg-sale-deep py-2">
        <div className="sale-marquee flex w-max">
          {[0, 1].map((half) => (
            <div key={half} className="flex shrink-0">
              {tickerItems.map((i) => (
                <span
                  key={i}
                  className={`flex items-center gap-6 pr-6 text-small font-bold whitespace-nowrap ${wide}`}
                >
                  {title}
                  <span className="opacity-60">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
