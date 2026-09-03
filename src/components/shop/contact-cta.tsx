import { useTranslations } from "next-intl"
import { MessageCircle, Camera } from "lucide-react"

import {
  CONTACT_COPY_EN,
  CONTACT_COPY_TH,
  INSTAGRAM_URL,
  LINE_URL,
} from "@/lib/brand"
import { Button } from "@/components/ui/button"

/**
 * The conversion surface — there is no checkout (plan: "Order CTA = LINE +
 * Instagram DM, no checkout"). `src/lib/brand.ts` owns the placeholder
 * handles; this component only ever reads them, never invents its own.
 */
export function ContactCta({
  locale,
  className,
  variant = "section",
}: {
  locale: string
  className?: string
  variant?: "section" | "inline"
}) {
  const t = useTranslations()
  const copy = locale === "th" ? CONTACT_COPY_TH : CONTACT_COPY_EN

  if (variant === "inline") {
    return (
      <div className={className}>
        <p className="mb-3 text-body text-foreground">{copy}</p>
        <div className="flex flex-wrap gap-3">
          <ContactButtons />
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
          <ContactButtons />
        </div>
      </div>
    </section>
  )
}

function ContactButtons() {
  return (
    <>
      <Button
        size="lg"
        nativeButton={false}
        render={<a href={LINE_URL} target="_blank" rel="noopener noreferrer" />}
      >
        <MessageCircle />
        LINE
      </Button>
      <Button
        size="lg"
        variant="outline"
        nativeButton={false}
        render={<a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" />}
      >
        <Camera />
        Instagram
      </Button>
    </>
  )
}
