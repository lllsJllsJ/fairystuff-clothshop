"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

/**
 * Moved from `src/components/checkout/order-id-copy.tsx` (deleted — the
 * order-ID success page it belonged to is gone now that `/track/[code]` is a
 * strict superset). Copies the random `preorderCode` string, not
 * `String(orderNo)` — printing the sequential order number anywhere public
 * defeats the point of the random code (see `src/db/queries/track.ts`).
 *
 * `navigator.clipboard` is guarded here (it's `undefined` outside a secure
 * context) — the original component's unguarded `await
 * navigator.clipboard.writeText(...)` would throw on plain HTTP.
 */
export function PreorderCodeCopy({ code }: { code: string }) {
  const t = useTranslations("track")
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard?.writeText(code)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => undefined)
  }

  return (
    <div className="mx-auto mt-5 flex w-fit items-center gap-3 border border-border bg-card px-5 py-4">
      <strong className="font-mono text-h3 tracking-wide select-all">{code}</strong>
      <Button type="button" size="icon-sm" variant="ghost" onClick={copy} aria-label={t("copyCode")}>
        {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
      </Button>
      <span className="sr-only" aria-live="polite">{copied ? t("copied") : ""}</span>
    </div>
  )
}
