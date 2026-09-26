import { useTranslations } from "next-intl"
import { ArrowRight, Baby, Layers, Shirt } from "lucide-react"

import { Link } from "@/i18n/navigation"

/**
 * Homepage "who are you shopping for?" entry — three DESIGN.md
 * Promotional Cards (12px radius, colour-coded) linking straight into the
 * filtered catalogue. Static links, no data: it never depends on the
 * database, so it renders even in a database-less prerender.
 */
export function AudienceEntry() {
  const t = useTranslations("home")

  const tiles = [
    {
      href: { pathname: "/shop", query: { audience: "adult" } },
      title: t("entryAdultTitle"),
      body: t("entryAdultBody"),
      icon: Shirt,
      style: { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" },
    },
    {
      href: { pathname: "/shop", query: { audience: "kids" } },
      title: t("entryKidsTitle"),
      body: t("entryKidsBody"),
      icon: Baby,
      style: { backgroundColor: "var(--accent-sky)", color: "#ffffff" },
    },
    {
      href: { pathname: "/shop", query: { kind: "sets" } },
      title: t("entrySetsTitle"),
      body: t("entrySetsBody"),
      icon: Layers,
      style: { backgroundColor: "var(--soft-mint)", color: "#1f3b3b" },
    },
  ] as const

  return (
    <section aria-labelledby="audience-entry-heading" className="bg-background">
      <div className="mx-auto max-w-[1440px] px-4 pt-12 sm:px-6 lg:px-8">
        <h2 id="audience-entry-heading" className="sr-only">
          {t("entryHeading")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((tile, index) => (
            <Link
              key={tile.title}
              href={tile.href}
              className={
                "group relative flex min-h-36 flex-col justify-between gap-4 overflow-hidden p-5 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-44 sm:p-6" +
                (index === 2 ? " col-span-2 sm:col-span-1" : "")
              }
              style={{ ...tile.style, borderRadius: "var(--radius-promo)" }}
            >
              <tile.icon
                className="absolute -right-3 -bottom-3 size-28 opacity-15 transition-transform duration-300 group-hover:scale-110"
                aria-hidden
              />
              <span className="text-h4 font-bold sm:text-h3">{tile.title}</span>
              <span className="flex items-center gap-1 text-small font-bold">
                {tile.body}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
