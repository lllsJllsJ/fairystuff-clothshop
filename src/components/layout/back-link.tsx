"use client"

import { ArrowLeft } from "lucide-react"
import { useTranslations } from "next-intl"

import { useRouter } from "@/i18n/navigation"
import { cn } from "@/lib/utils"

/**
 * "Back" affordance for admin detail/edit screens.
 *
 * Uses `router.back()` rather than a hard-coded parent href on purpose: the
 * same order detail page is reached from the order list, from a report row,
 * and from the dashboard, and a fixed `/admin/orders` link would silently
 * throw away the filters, sort, page number, and scroll position the owner
 * had. History navigation returns them to exactly where they were.
 *
 * `fallbackHref` covers the one case history cannot: a cold entry to this
 * URL (pasted link, refresh into a new tab, a fresh session opened at this
 * route). `history.length <= 1` means there is nothing to go back TO, and
 * `router.back()` would do nothing at all — leaving the owner stuck on a
 * page whose only exit is the nav bar. `next-intl`'s `useRouter` keeps the
 * locale prefix on that fallback.
 */
export function BackLink({
  fallbackHref,
  label,
  className,
}: {
  fallbackHref: string
  /** Overrides the default "Back" copy (e.g. "Continue shopping"). */
  label?: string
  className?: string
}) {
  const t = useTranslations()
  const router = useRouter()

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push(fallbackHref)
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={cn(
        "-mx-1 inline-flex items-center gap-1.5 rounded px-1 text-small text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label ?? t("common.back")}
    </button>
  )
}
