import { getTranslations } from "next-intl/server"
import { ArrowUpRight, MessageCircle } from "lucide-react"

import { CONTACT_COPY_EN, CONTACT_COPY_TH } from "@/lib/brand"
import { contactLinks, type ShopSettings } from "@/db/queries/settings"
import { ChannelBadge, type ContactChannel } from "@/components/shop/social-icons"

type ChannelCard = { channel: ContactChannel; href: string; name: string; detail: string }

/**
 * The storefront's ONE contact surface: a pink band at the top of the
 * footer (so it closes every storefront page) with one card per configured
 * channel showing its real handle. Deliberately the only place the channel
 * logos appear — the footer below it carries no second set. Renders nothing
 * when the owner hasn't configured any channel (Settings -> Storefront).
 */
export async function ContactBand({ settings, locale }: { settings: ShopSettings; locale: string }) {
  const t = await getTranslations("shop")
  const links = contactLinks(settings)
  const copy = locale === "th" ? CONTACT_COPY_TH : CONTACT_COPY_EN

  const channels: ChannelCard[] = [
    links.lineUrl
      ? { channel: "line" as const, href: links.lineUrl, name: "LINE", detail: settings.lineId?.trim() ?? "" }
      : null,
    links.instagramUrl
      ? {
          channel: "instagram" as const,
          href: links.instagramUrl,
          name: "Instagram",
          detail: `@${settings.instagramHandle?.trim().replace(/^@/, "") ?? ""}`,
        }
      : null,
    links.facebookUrl
      ? { channel: "facebook" as const, href: links.facebookUrl, name: "Facebook", detail: t("contactFacebookDetail") }
      : null,
  ].filter((channel) => channel !== null)

  if (channels.length === 0) return null

  // Literal class names so Tailwind can see them.
  const columns = channels.length === 3 ? "sm:grid-cols-3" : channels.length === 2 ? "sm:grid-cols-2" : ""

  return (
    <section
      aria-labelledby="contact-band-heading"
      className="relative isolate overflow-hidden bg-primary text-primary-foreground"
    >
      <span aria-hidden className="absolute -top-24 -left-24 -z-10 size-72 rounded-full bg-white/10" />
      <span aria-hidden className="absolute -right-16 -bottom-32 -z-10 size-80 rounded-full bg-white/10" />

      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-center lg:gap-12 lg:px-8">
        <div className="flex flex-col items-start gap-3">
          <span className="inline-flex items-center gap-2 bg-white/15 px-3 py-1 text-small font-bold">
            <MessageCircle className="size-4" aria-hidden />
            {t("contactEyebrow")}
          </span>
          <h2 id="contact-band-heading" className="text-h3 font-bold lg:text-h2">
            {t("contactToOrder")}
          </h2>
          <p className="max-w-md text-body text-white">{copy}</p>
        </div>

        <ul className={`grid gap-3 ${columns}`}>
          {channels.map((channel) => (
            <li key={channel.channel}>
              <a
                href={channel.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex h-full items-center gap-4 bg-card p-4 text-card-foreground shadow-[var(--shadow-raised-sm)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised-lg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:flex-col sm:items-start sm:gap-3 sm:p-5"
                style={{ borderRadius: "var(--radius-promo)" }}
              >
                <ChannelBadge channel={channel.channel} className="size-11" />
                <span className="flex min-w-0 flex-1 flex-col sm:w-full">
                  <span className="text-subtitle font-bold">{channel.name}</span>
                  <span className="truncate text-small text-muted-foreground">{channel.detail}</span>
                </span>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground sm:absolute sm:top-4 sm:right-4">
                  <ArrowUpRight className="size-4" aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
