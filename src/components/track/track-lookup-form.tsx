"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "@/i18n/navigation"
import { normalizePreorderCode } from "@/lib/preorder-code"

/**
 * Client-side shape validation before any server round trip — this is the
 * one place `normalizePreorderCode` runs in a browser. Garbage input (wrong
 * length, wrong alphabet, empty) is rejected instantly with no request; a
 * well-shaped code is routed to `/track/[code]`, which is the ONLY place
 * that actually checks whether an order exists.
 */
export function TrackLookupForm() {
  const t = useTranslations("track")
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const raw = String(new FormData(event.currentTarget).get("code") ?? "")
    const code = normalizePreorderCode(raw)
    if (!code) {
      setError(t("lookupInvalid"))
      return
    }
    router.push(`/track/${code}`)
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="code">{t("code")}</Label>
        <Input
          id="code"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="PO-XXXXXXXXXX"
          onChange={() => setError(null)}
          required
        />
        {error && <p role="alert" className="text-small text-destructive">{error}</p>}
      </div>
      <Button type="submit" size="lg" className="w-full">{t("lookupSubmit")}</Button>
    </form>
  )
}
