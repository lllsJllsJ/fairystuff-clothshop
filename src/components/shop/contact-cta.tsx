import { getTranslations } from "next-intl/server"
import { MessageCircle, Camera, ExternalLink } from "lucide-react"

import {
  CONTACT_COPY_EN,
  CONTACT_COPY_TH,
} from "@/lib/brand"
import { contactLinks, getShopSettings } from "@/db/queries/settings"
import { Button } from "@/components/ui/button"

/**
 * Contact surface backed by owner-managed shop settings. Checkout uses the
 * same contacts when asking customers to send their generated order number.
 */
export async function ContactCta({
  locale,
  className,
  variant = "section",
}: {
  locale: string
  className?: string
  variant?: "section" | "inline"
}) {
  const [t, settings] = await Promise.all([getTranslations(), getShopSettings()])
  const links = contactLinks(settings)
  const copy = locale === "th" ? CONTACT_COPY_TH : CONTACT_COPY_EN
  if (!links.lineUrl && !links.instagramUrl && !links.facebookUrl) return null

  if (variant === "inline") {
    return (
      <div className={className}>
        <p className="mb-3 text-body text-foreground">{copy}</p>
        <div className="flex flex-wrap gap-3">
          <ContactButtons {...links} />
        </div>
      </div>
    )
  }

  return (
    <section className={className} aria-labelledby="contact-cta-heading">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-4 px-4 py-17 text-center sm:px-6 lg:px-8">
        <h2 id="contact-cta-heading" className="text-h2 font-bold text-foreground">
          {t("shop.contactToOrder")}
        </h2>
        <p className="max-w-md text-body text-muted-foreground">{copy}</p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <ContactButtons {...links} />
        </div>
      </div>
    </section>
  )
}

function ContactButtons({ lineUrl, instagramUrl, facebookUrl }: { lineUrl: string | null; instagramUrl: string | null; facebookUrl: string | null }) {
  return (
    <>
      {lineUrl && <Button
        size="lg"
        nativeButton={false}
        render={<a href={lineUrl} target="_blank" rel="noopener noreferrer" />}
      >
        <MessageCircle />
        LINE
      </Button>}
      {instagramUrl && <Button
        size="lg"
        variant="outline"
        nativeButton={false}
        render={<a href={instagramUrl} target="_blank" rel="noopener noreferrer" />}
      >
        <Camera />
        Instagram
      </Button>}
      {facebookUrl && <Button
        size="lg"
        variant="outline"
        nativeButton={false}
        render={<a href={facebookUrl} target="_blank" rel="noopener noreferrer" />}
      >
        <ExternalLink />
        Facebook
      </Button>}
    </>
  )
}
