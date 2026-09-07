"use client"

import { useTransition } from "react"
import { useLocale } from "next-intl"
import { Globe } from "lucide-react"

import { usePathname, useRouter } from "@/i18n/navigation"
import type { Locale } from "@/i18n/request"
import { Button } from "@/components/ui/button"

/**
 * Locale is now a navigation concern (URL segment), not a cookie — see
 * src/i18n/request.ts. Switching language means re-navigating to the same
 * pathname under the other locale prefix; `useRouter` from
 * `@/i18n/navigation` does the prefix swap, and `usePathname` from the
 * same module already returns the locale-agnostic pathname so it can be
 * reused unchanged for both locales.
 */
export function LocaleToggle() {
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next: Locale = locale === "th" ? "en" : "th"
    startTransition(() => {
      router.replace(pathname, { locale: next })
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={pending}
      aria-label="Toggle language"
      className="gap-1.5"
    >
      <Globe className="size-4" />
      <span className="font-medium">{locale === "th" ? "TH" : "EN"}</span>
    </Button>
  )
}
