"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react"

import { cn } from "@/lib/utils"
import { useRouter } from "@/i18n/navigation"
import { formatBaht } from "@/lib/format"
import { parseProductWorkbook, type ParsedProductRow } from "@/lib/import/parse-products"
import { importProducts, type ImportRowValues } from "@/app/[locale]/admin/products/import/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

/** Port of carstockpro's `car-import.tsx`: drop -> editable preview ->
 * confirm. Duplicate detection uses `getProductCodes()` (page-loaded, via
 * `existingCodes`) — the analogue of carstockpro's `getCarRegistrations()`
 * — but unlike that importer (which has no update path and would just
 * fail a duplicate registration on the DB's unique index), plan Risk 7
 * calls for a per-row update-or-skip choice on each duplicate, since a
 * clothing stock sheet is commonly re-imported to refresh a known
 * catalogue rather than only ever adding new codes. */

type DraftRow = ParsedProductRow & {
  /** Only meaningful when the row's code is a duplicate — see the Switch
   * rendered for duplicate rows below. Defaults to false (skip): an
   * unreviewed duplicate must never silently overwrite existing data. */
  updateExisting: boolean
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase()
}

function variantSummary(variants: ParsedProductRow["variants"]): string {
  if (variants.length === 0) return ""
  return variants.map((v) => `${v.color} ${v.size}:${v.quantity}`).join(", ")
}

export function ProductImport({ existingCodes }: { existingCodes: string[] }) {
  const t = useTranslations()
  const router = useRouter()

  const [rows, setRows] = useState<DraftRow[] | null>(null)
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)

  const existing = useMemo(() => new Set(existingCodes.map(normalizeCode)), [existingCodes])

  const included = rows?.filter((r) => r.include) ?? []
  const skipped = (rows?.length ?? 0) - included.length

  async function handleFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setFileName(file.name)

    const result = parseProductWorkbook(await file.arrayBuffer())
    if (!result.ok) {
      toast.error(result.error === "no_rows" ? t("import.noRows") : t("import.parseError"))
      setRows(null)
      return
    }
    setRows(result.rows.map((row) => ({ ...row, updateExisting: false })))
  }

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? prev)
  }

  async function handleImport() {
    if (!included.length) return
    setImporting(true)
    try {
      const payload: ImportRowValues[] = included.map((r) => ({
        productCode: r.productCode,
        productName: r.productName,
        productType: r.productType,
        sellPrice: r.sellPrice,
        originalPrice: r.originalPrice,
        buyingSource: r.buyingSource,
        sourceLink: r.sourceLink,
        variants: r.variants,
        updateExisting: r.updateExisting,
      }))
      const result = await importProducts(payload)
      if (!result.ok) {
        toast.error(errorMessage(result.error))
        return
      }
      if (result.created > 0) toast.success(t("import.created", { count: result.created }))
      if (result.updated > 0) toast.success(t("import.updated", { count: result.updated }))
      router.push("/admin/products")
      router.refresh()
    } finally {
      setImporting(false)
    }
  }

  function errorMessage(code: string): string {
    if (code === "forbidden") return t("errors.forbidden")
    if (code === "unauthorized") return t("errors.unauthorized")
    if (code === "invalid") return t("errors.invalid")
    return t("errors.generic")
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 border border-border bg-card p-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-input px-4 py-8 text-body text-muted-foreground hover:bg-muted">
          {fileName ? (
            <>
              <FileSpreadsheet className="size-6" />
              <span className="font-medium text-foreground">{fileName}</span>
              <span className="text-small">{t("import.selectFile")}</span>
            </>
          ) : (
            <>
              <Upload className="size-6" />
              <span>{t("import.dropHint")}</span>
            </>
          )}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files)}
          />
        </label>

        <div className="text-small text-muted-foreground">
          <p className="font-bold">{t("import.columns")}</p>
          <p className="mt-0.5">{t("import.columnsHelp")}</p>
        </div>
      </section>

      {rows && (
        <>
          <section className="space-y-1">
            <h2 className="text-h4 font-bold text-foreground">{t("import.preview")}</h2>
            <p className="text-small text-muted-foreground">
              {t("import.rowsFound", { count: rows.length })}
              {" · "}
              {t("import.rowsReady", { count: included.length })}
              {skipped > 0 && ` · ${t("import.rowsSkipped", { count: skipped })}`}
            </p>
          </section>

          <div className="space-y-3">
            {rows.map((row) => {
              const duplicate =
                row.productCode.length > 0 && existing.has(normalizeCode(row.productCode))

              return (
                <div
                  key={row.key}
                  className={cn(
                    "space-y-3 border border-border bg-card p-4",
                    !row.include && "opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-small text-muted-foreground">
                      {t("import.sourceRow")} {row.sourceRow}
                    </span>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`inc-${row.key}`} className="text-small text-muted-foreground">
                        {row.include ? t("import.includeRow") : t("import.skipRow")}
                      </Label>
                      <Switch
                        id={`inc-${row.key}`}
                        checked={row.include}
                        onCheckedChange={(checked) => updateRow(row.key, { include: checked })}
                      />
                    </div>
                  </div>

                  {!row.productCode && <Warning message={t("import.noProductCode")} />}
                  {duplicate && <Warning message={t("import.duplicate")} />}

                  {duplicate && row.include && (
                    <div className="flex items-center gap-2 bg-accent px-3 py-2">
                      <Switch
                        id={`upd-${row.key}`}
                        checked={row.updateExisting}
                        onCheckedChange={(checked) => updateRow(row.key, { updateExisting: checked })}
                      />
                      <Label htmlFor={`upd-${row.key}`} className="text-body">
                        {row.updateExisting ? t("import.updateExisting") : t("import.skipExisting")}
                      </Label>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Cell label={t("product.code")}>
                      <Input
                        value={row.productCode}
                        onChange={(e) => updateRow(row.key, { productCode: e.target.value })}
                      />
                    </Cell>
                    <Cell label={t("product.name")}>
                      <Input
                        value={row.productName}
                        onChange={(e) => updateRow(row.key, { productName: e.target.value })}
                      />
                    </Cell>
                    <Cell label={t("product.type")}>
                      <Input
                        value={row.productType}
                        onChange={(e) => updateRow(row.key, { productType: e.target.value })}
                      />
                    </Cell>
                    <Cell label={t("product.sellPrice")}>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={row.sellPrice}
                        onChange={(e) =>
                          updateRow(row.key, { sellPrice: Number(e.target.value || 0) })
                        }
                      />
                    </Cell>
                    <Cell label={t("product.originalPrice")}>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={row.originalPrice}
                        onChange={(e) =>
                          updateRow(row.key, { originalPrice: Number(e.target.value || 0) })
                        }
                      />
                    </Cell>
                    <div className="flex items-end">
                      <p className="text-small text-muted-foreground">
                        {t("product.margin")}: {formatBaht(row.sellPrice - row.originalPrice)}
                      </p>
                    </div>
                    <Cell label={t("product.buyingSource")}>
                      <Input
                        value={row.buyingSource}
                        onChange={(e) => updateRow(row.key, { buyingSource: e.target.value })}
                      />
                    </Cell>
                    <Cell label={t("product.sourceLink")}>
                      <Input
                        value={row.sourceLink}
                        onChange={(e) => updateRow(row.key, { sourceLink: e.target.value })}
                      />
                    </Cell>
                  </div>

                  {row.variants.length > 0 && (
                    <p className="text-small text-muted-foreground">
                      {t("product.variantsTitle")}: {variantSummary(row.variants)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="sticky bottom-0 flex gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => router.back()}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1"
              onClick={handleImport}
              disabled={importing || included.length === 0}
            >
              {importing && <Loader2 className="animate-spin" />}
              {importing ? t("import.importing") : t("import.confirm")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function Warning({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 text-small text-warning">
      <AlertTriangle className="size-3.5 shrink-0" />
      {message}
    </p>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-small text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
