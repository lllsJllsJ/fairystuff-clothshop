import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"

import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { HeroCarousel } from "@/components/shop/hero-carousel"

/**
 * The right column shows the owner's hero photos (Admin -> Settings, up to
 * 3, as a crossfading HeroCarousel) layered over a soft-mint block offset
 * behind it for depth. With no photos configured it falls back to
 * DESIGN.md's own palette instead of a stock gradient-blob: an asymmetric
 * stack of the system's accent colours (soft mint, pastel green, warm
 * brown) that reads as an intentional editorial mark, not a placeholder.
 *
 * `brandName`/`tagline` come from the parent page, which already reads
 * `shop_settings` for `generateMetadata` — passed down as props rather
 * than fetched again here.
 */
export function Hero({
  brandName,
  tagline,
  images,
}: {
  brandName: string
  tagline: string
  /** Public same-origin URLs (heroImageUrl()), in display order. */
  images: string[]
}) {
  const t = useTranslations()

  return (
    <section className="relative overflow-hidden bg-primary" aria-labelledby="hero-heading">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-8 px-4 py-21 sm:px-6 md:py-30 lg:grid-cols-2 lg:px-8">
        <div className="relative z-[var(--z-raised)] flex flex-col items-start gap-5 text-left">
          <span className="border border-white/40 px-3 py-1 text-small font-bold text-white">
            {brandName}
          </span>
          <h1 id="hero-heading" className="text-h1 font-bold text-white lg:text-[56px] lg:leading-[1.1]">
            {t("home.heroTitle")}
          </h1>
          <p className="max-w-md text-subtitle text-white/90">{tagline}</p>
          <p className="max-w-md text-body text-white/80">{t("home.heroSubtitle")}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/shop" />}
              className="bg-white text-primary hover:bg-white/90"
            >
              {t("home.heroCta")}
              <ArrowRight />
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/about" />}
              className="border-white bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              {t("home.heroSecondaryCta")}
            </Button>
          </div>
        </div>

        {images.length ? (
          <div className="relative mx-auto w-full max-w-md lg:mr-0 lg:max-w-[440px]">
            <div
              className="absolute -right-3 -bottom-3 h-full w-full sm:-right-5 sm:-bottom-5"
              style={{ backgroundColor: "var(--soft-mint)", borderRadius: "var(--radius-promo)" }}
              aria-hidden
            />
            <div
              className="absolute -top-4 -left-4 size-16 sm:size-20"
              style={{ backgroundColor: "var(--warm-brown)", borderRadius: "var(--radius-full)" }}
              aria-hidden
            />
            <HeroCarousel images={images} />
          </div>
        ) : (
          <div className="relative hidden h-64 lg:block lg:h-80" aria-hidden>
            <div
              className="absolute right-0 top-4 h-48 w-56 lg:h-56 lg:w-64"
              style={{ backgroundColor: "var(--soft-mint)", borderRadius: "var(--radius-promo)" }}
            />
            <div
              className="absolute right-24 top-24 h-40 w-40 lg:right-32 lg:h-48 lg:w-48"
              style={{ backgroundColor: "var(--pastel-green)", borderRadius: "var(--radius-promo)" }}
            />
            <div
              className="absolute bottom-0 right-8 h-24 w-24 lg:h-28 lg:w-28"
              style={{ backgroundColor: "var(--warm-brown)", borderRadius: "var(--radius-full)" }}
            />
          </div>
        )}
      </div>
    </section>
  )
}
