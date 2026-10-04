import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { ArrowRight, MessageCircleHeart, PackageSearch, Ruler } from "lucide-react"

import { Link } from "@/i18n/navigation"

/**
 * Home-page brand block: a layered visual (one of the owner's hero photos
 * over offset pastel blocks — or, with no photos, the hero's own colour-block
 * mark around the brand name) beside the story teaser, then three short
 * "why shop here" points. Every point describes something the shop really
 * does (chat-confirmed preorder, adult + kids sizing, code-based tracking) —
 * keep them true if the flows change.
 */
export async function StorySection({
  brandName,
  tagline,
  imageUrl,
  locale,
}: {
  locale: string
  brandName: string
  tagline: string
  /** A hero photo URL (heroImageUrl()), or null for the colour-block mark. */
  imageUrl: string | null
}) {
  const t = await getTranslations("home")
  const values = [
    { icon: MessageCircleHeart, tint: "bg-[var(--soft-mint)]", title: t("valuePreorderTitle"), body: t("valuePreorderBody") },
    { icon: Ruler, tint: "bg-[#fde3ec]", title: t("valueSizesTitle"), body: t("valueSizesBody") },
    { icon: PackageSearch, tint: "bg-[#e3f0fe]", title: t("valueTrackTitle"), body: t("valueTrackBody") },
  ]

  return (
    <section aria-labelledby="story-heading" className="overflow-hidden bg-background">
      <div className="mx-auto max-w-[1440px] px-4 py-17 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Visual — decorative, so the blocks are aria-hidden. */}
          <div className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div
              aria-hidden
              className="absolute -right-3 -bottom-3 h-full w-full bg-[var(--soft-mint)] sm:-right-5 sm:-bottom-5"
              style={{ borderRadius: "var(--radius-promo)" }}
            />
            <div
              aria-hidden
              className="absolute -top-4 -left-4 size-16 bg-primary sm:size-20"
              style={{ borderRadius: "var(--radius-promo)" }}
            />
            <div
              className="relative aspect-[4/3] overflow-hidden bg-[var(--pastel-green)]"
              style={{ borderRadius: "var(--radius-promo)" }}
            >
              {imageUrl ? (
                <Image src={imageUrl} alt="" fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
              ) : (
                <div aria-hidden className="flex h-full items-center justify-center">
                  <span className="absolute right-8 bottom-8 size-24 rounded-full bg-[var(--warm-brown)] sm:size-32" />
                  <span
                    className="relative bg-background px-6 py-4 text-h3 font-bold text-foreground shadow-[var(--shadow-raised-md)]"
                    style={{ borderRadius: "var(--radius-promo)" }}
                  >
                    {brandName}
                  </span>
                </div>
              )}
            </div>
            <span
              aria-hidden
              className="absolute -bottom-6 left-6 size-12 rounded-full border-4 border-background bg-[var(--warm-brown)] sm:size-14"
            />
          </div>

          <div className="flex flex-col items-start gap-5">
            <p className={`flex items-center gap-3 text-small font-bold text-primary ${locale === "th" ? "" : "tracking-wider uppercase"}`}>
              <span aria-hidden className="h-0.5 w-8 bg-primary" />
              {t("storyTitle")}
            </p>
            <h2 id="story-heading" className="text-h2 font-bold text-foreground lg:text-[40px] lg:leading-[1.2]">
              {tagline}
            </h2>
            <p className="max-w-lg text-subtitle text-muted-foreground">{t("storySubtitle")}</p>
            <Link
              href="/about"
              className="group mt-1 inline-flex min-h-11 items-center gap-2 border-2 border-foreground px-5 font-bold text-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("storyCta")}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
        </div>

        <ul className="mt-16 grid gap-4 sm:grid-cols-3 lg:mt-20">
          {values.map((value) => {
            const Icon = value.icon
            return (
              <li
                key={value.title}
                className="flex gap-4 border border-[var(--border-lighter)] bg-card p-5 transition-shadow duration-200 hover:shadow-[var(--shadow-raised-md)]"
                style={{ borderRadius: "var(--radius-promo)" }}
              >
                <span
                  aria-hidden
                  className={`flex size-11 shrink-0 items-center justify-center rounded-full text-foreground ${value.tint}`}
                >
                  <Icon className="size-5" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-body font-bold text-foreground">{value.title}</h3>
                  <p className="text-small text-muted-foreground">{value.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
