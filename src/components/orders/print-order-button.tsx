"use client"

import { useTranslations } from "next-intl"
import { Printer } from "lucide-react"

import { printReport } from "@/lib/export"
import { Button } from "@/components/ui/button"

/** `lib/export.ts#printReport` is `window.print()` — a client-only call,
 * so this tiny wrapper is the client boundary the otherwise-server
 * `[id]/page.tsx` needs to offer a print button. `print:hidden` (Tailwind's
 * print variant) hides the button itself in the printed output — the page
 * shows the receipt-only block instead (see that page's comment). */
export function PrintOrderButton() {
  const t = useTranslations()
  return (
    <Button type="button" variant="outline" onClick={printReport} className="print:hidden">
      <Printer />
      {t("reports.print")}
    </Button>
  )
}
