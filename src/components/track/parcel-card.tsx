"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink, Truck } from "lucide-react"
import { useTranslations } from "next-intl"

import { trackingUrlFor } from "@/lib/carriers"
import { Button } from "@/components/ui/button"

/**
 * The customer's parcel: carrier, tracking number (copyable), and a link
 * to the carrier's own tracking page when we know its URL format. Only the
 * FINAL delivery parcel is ever shown — the preorder's inbound legs
 * (China -> Thailand) are admin-only and never reach /track.
 */
export function ParcelCard({ carrier, trackingNo }: { carrier: string | null; trackingNo: string }) {
  const t = useTranslations("track")
  const [copied, setCopied] = useState(false)
  const href = trackingUrlFor(carrier, trackingNo)

  function copy() {
    navigator.clipboard
      ?.writeText(trackingNo)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => undefined)
  }

  return (
    <section className="mt-4 border-2 border-primary/30 bg-card p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Truck className="size-5 text-primary" aria-hidden />
        {t("parcelTitle")}
      </h2>
      {carrier && <p className="mt-2 text-body text-muted-foreground">{carrier}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <strong className="font-mono text-h4 tracking-wide select-all">{trackingNo}</strong>
        <Button type="button" size="icon-sm" variant="ghost" onClick={copy} aria-label={t("copyTracking")}>
          {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
        </Button>
        <span className="sr-only" aria-live="polite">{copied ? t("trackingCopied") : ""}</span>
      </div>
      {href && (
        <Button
          className="mt-3"
          variant="outline"
          render={<a href={href} target="_blank" rel="noopener noreferrer" />}
          nativeButton={false}
        >
          {t("trackParcel")}
          <ExternalLink />
        </Button>
      )}
    </section>
  )
}
