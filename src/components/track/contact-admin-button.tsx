"use client"

import { MessageCircle } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

/**
 * The primary LINE handoff on the track page. `lineMessageUrl` is built
 * SERVER-SIDE (see `src/db/queries/settings.ts#lineMessageUrl` and the track
 * page) so the prefilled message text matches the request's locale segment.
 *
 * ---------------------------------------------------------------------
 * WHY THIS IS A REAL <a>, NOT A CLICK HANDLER THAT AWAITS THE CLIPBOARD
 * ---------------------------------------------------------------------
 * Do NOT `await navigator.clipboard.writeText(...)` and then
 * `window.open(...)` — the `await` consumes the click's user-gesture token
 * before the popup call runs, so browsers block it as an unrequested popup.
 * Below, `nativeButton={false} render={<a href=... target="_blank" />}`
 * makes the browser navigate NATIVELY on the same click that carries the
 * gesture; the clipboard write is a fire-and-forget side effect in
 * `onClick` that never blocks or delays that navigation. This also means
 * the copy always fires exactly once, on every platform — which is what
 * makes it a real desktop fallback (see the file-level comment on
 * `lineMessageUrl`) rather than a "best effort" convenience.
 */
export function ContactAdminButton({ href, code }: { href: string; code: string }) {
  const t = useTranslations("track")

  function copyCodeSideEffect() {
    // Guarded: `navigator.clipboard` is undefined outside a secure context
    // (plain HTTP), and this must never block or throw into the click. On
    // desktop LINE — where the prefill is silently dropped — the code is now
    // sitting in the clipboard, ready to paste into the chat that just opened.
    navigator.clipboard?.writeText(code).catch(() => undefined)
  }

  return (
    <Button
      size="lg"
      nativeButton={false}
      render={<a href={href} target="_blank" rel="noopener noreferrer" onClick={copyCodeSideEffect} />}
    >
      <MessageCircle />
      {t("contactAdmin")}
    </Button>
  )
}
