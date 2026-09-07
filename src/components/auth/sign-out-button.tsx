"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { useLocale, useTranslations } from "next-intl"
import { Loader2, LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"

type SignOutButtonProps = {
  appearance?: "menu" | "mobile" | "outline"
}

export function SignOutButton({ appearance = "menu" }: SignOutButtonProps) {
  const locale = useLocale()
  const t = useTranslations("nav")
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    if (pending) return
    setPending(true)
    try {
      // The client helper broadcasts the session change to SessionProvider
      // before assigning window.location, so the persistent storefront
      // header cannot retain a stale signed-in state after logout.
      await signOut({ redirectTo: `/${locale}` })
    } catch {
      setPending(false)
    }
  }

  if (appearance === "outline") {
    return (
      <Button type="button" variant="outline" disabled={pending} onClick={handleSignOut}>
        {pending && <Loader2 className="animate-spin" />}
        {t("logout")}
      </Button>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleSignOut}
      className={appearance === "mobile"
        ? "flex min-h-11 w-full items-center gap-2 px-3 text-link hover:bg-muted disabled:opacity-50"
        : "flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none hover:bg-muted disabled:opacity-50"
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
      {t("logout")}
    </button>
  )
}
