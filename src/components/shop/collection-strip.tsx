import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"

import { Link } from "@/i18n/navigation"
import type { PublicCharacterFacet } from "@/db/queries/storefront"

const PROMO_COLORS = ["var(--primary)", "var(--secondary)", "var(--pastel-green)"] as const

/** DESIGN.md §4 "Promotional Card": 12px radius, colour-cycled, white bold label. */
export function CollectionStrip({ characters }: { characters: PublicCharacterFacet[] }) {
  const t = useTranslations()
  const locale = useLocale()

  if (characters.length === 0) return null

  return (
    <section aria-labelledby="collections-heading" className="bg-background">
      <div className="mx-auto max-w-[1440px] px-4 py-17 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id="collections-heading" className="text-h2 font-bold text-foreground">
              {t("shop.collections")}
            </h2>
            <p className="text-body text-muted-foreground">{t("home.collectionsSubtitle")}</p>
          </div>
          <Link
            href="/shop"
            className="hidden shrink-0 text-link hover:text-link-hover hover:underline sm:inline"
          >
            {t("shop.allProducts")}
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {characters.map((character, index) => (
            <Link
              key={character.id}
              href={{ pathname: "/shop", query: { character: character.slug } }}
              className="group flex flex-col justify-between gap-6 p-5 text-white transition-transform duration-200 hover:-translate-y-0.5"
              style={{
                backgroundColor: PROMO_COLORS[index % PROMO_COLORS.length],
                borderRadius: "var(--radius-promo)",
              }}
            >
              <span className="text-subtitle font-bold">
                {locale === "en" ? (character.nameEn ?? character.name) : character.name}
              </span>
              <span className="flex items-center gap-1 text-small font-bold">
                {character.count}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
