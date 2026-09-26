"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Download, Loader2 } from "lucide-react"

import { exportToExcel } from "@/lib/export"
import {
  exportProducts,
  type ExportFilters,
} from "@/app/[locale]/admin/products/export-actions"
import { Button } from "@/components/ui/button"

/** Downloads every product matching the list's current filters, in the
 * import template layout — edit it and import it back to upsert. */
export function ProductExportButton({ filters }: { filters: ExportFilters }) {
  const t = useTranslations("product")
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    setBusy(true)
    try {
      const result = await exportProducts(filters)
      if (!result.ok) {
        toast.error(t("exportFailed"))
        return
      }
      if (result.rows.length === 0) {
        toast.info(t("exportEmpty"))
        return
      }
      const stamp = new Date().toISOString().slice(0, 10)
      exportToExcel(`products-${stamp}`, "Products", result.rows)
      toast.success(t("exported", { count: result.rows.length }))
    } catch {
      toast.error(t("exportFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={busy} aria-label={t("export")}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      <span className="hidden sm:inline">{t("export")}</span>
    </Button>
  )
}
