"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

export function OrderIdCopy({ orderNo }: { orderNo: number }) {
  const t = useTranslations("checkout")
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(String(orderNo))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto mt-5 flex w-fit items-center gap-3 border border-border bg-card px-5 py-4">
      <strong className="text-h3">#{orderNo}</strong>
      <Button type="button" size="icon-sm" variant="ghost" onClick={copy} aria-label={t("copyOrderId")}>
        {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
      </Button>
      <span className="sr-only" aria-live="polite">{copied ? t("copied") : ""}</span>
    </div>
  )
}
