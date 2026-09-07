import { useLocale, useTranslations } from "next-intl"

import { Link } from "@/i18n/navigation"
import type { PublicCharacterFacet } from "@/db/queries/storefront"

const CHIP_CLASS =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 border border-border bg-background px-3.5 py-2 text-small font-bold text-foreground transition-colors hover:border-foreground hover:bg-muted"

/**
 * The home page's quick entry into the catalogue: a horizontally scrollable
 * row of character chips above the "New in" grid.
 *
 * Deliberately NOT a client component and NOT a copy of `ShopBrowser` —
 * every chip is a plain `<Link>` to `/shop?character=<slug>`, which
 * `ShopBrowser` already seeds its filter state from on mount (see its
 * `useState` initialisers). That keeps `/` free of the TanStack
 * Query/`useSearchParams` machinery and, more importantly, keeps it
 * statically renderable (`revalidate = 300`) — a client-side filter here
 * would drag the home page toward dynamic rendering for a UI whose only
 * job is to navigate away.
 *
 * Characters are the only axis by design: they are the shop's public
 * taxonomy (`product_characters`), and the same facet drives both
 * `ShopFilters`' character select and `CollectionStrip`. Product type is
 * deliberately not offered here — it is an admin-facing attribute, and
 * `GET /api/products` exposes no `type` parameter for a chip to point at.
 *
 * Renders nothing when no active product has a character assigned, since
 * every chip would lead to an empty result.
 */
export function QuickFilterRail({ characters }: { characters: PublicCharacterFacet[] }) {
  const t = useTranslations()
  const locale = useLocale()

  if (characters.length === 0) return null

  return (
    <nav aria-label={t("shop.quickFilterLabel")} className="mb-6">
      {/* Negative margins + matching padding let the row bleed to the screen
          edge while scrolling on mobile, without breaking the section's
          max-width gutter on desktop. */}
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <li className="snap-start">
          <Link
            href="/shop"
            className={CHIP_CLASS}
            style={{ borderRadius: "var(--radius-full)" }}
          >
            {t("common.all")}
          </Link>
        </li>
        {characters.map((character) => (
          <li key={character.id} className="snap-start">
            <Link
              href={{ pathname: "/shop", query: { character: character.slug } }}
              className={CHIP_CLASS}
              style={{ borderRadius: "var(--radius-full)" }}
            >
              {locale === "en" ? (character.nameEn ?? character.name) : character.name}
              <span className="text-muted-foreground">{character.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
