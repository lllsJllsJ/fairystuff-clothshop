"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImageIcon,
  Loader2,
  Upload,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Link } from "@/i18n/navigation"
import { formatBaht } from "@/lib/format"
import { exportToExcel } from "@/lib/export"
import {
  createIssues,
  parseProductWorkbook,
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  type RowIssue,
  type TemplateRow,
} from "@/lib/import/product-template"
import { IMPORT_CHUNK_SIZE, type ProductImportRow } from "@/lib/validations/product"
import type { ProductImportIndexEntry } from "@/db/queries/products"
import { importProductsChunk } from "@/app/[locale]/admin/products/import/actions"
import type { ImportRowResult } from "@/lib/import/import-product"
import { Button } from "@/components/ui/button"

/**
 * Import flow: drop a sheet -> every row is classified in the preview ->
 * import in small chunks with progress -> per-row results.
 *
 *   New                 no code: created, code generated on save
 *   Will update         code exists: upsert (blank cells keep old values)
 *   Code not found      code given but unknown: created with a NEW code
 *   Duplicate in file   same code earlier in the sheet: skipped
 *   Error               can't be imported as-is (reason shown)
 *
 * Updating a product never changes past orders — the preview says so next
 * to every price change (see lib/import/import-product.ts).
 */

type RowStatus = "new" | "update" | "not_found" | "duplicate" | "error"

type PreviewRow = {
  row: TemplateRow
  status: RowStatus
  issues: RowIssue[]
  existing?: ProductImportIndexEntry
}

const STATUS_STYLE: Record<RowStatus, string> = {
  new: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  update: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  not_found: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  duplicate: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
}

function classify(rows: TemplateRow[], existing: Map<string, ProductImportIndexEntry>): PreviewRow[] {
  const firstIndex = new Map<string, number>()
  rows.forEach((row, index) => {
    const code = row.productCode.toLowerCase()
    if (code && !firstIndex.has(code)) firstIndex.set(code, index)
  })

  return rows.map((row, index) => {
    const code = row.productCode.toLowerCase()
    const match = code ? existing.get(code) : undefined
    if (code && firstIndex.get(code) !== index) {
      return { row, status: "duplicate", issues: [] }
    }
    const issues = [...row.issues, ...(match ? [] : createIssues(row))]
    if (issues.length > 0) return { row, status: "error", issues, existing: match }
    if (match) return { row, status: "update", issues, existing: match }
    return { row, status: code ? "not_found" : "new", issues }
  })
}

function toPayload(row: TemplateRow): ProductImportRow {
  // `issues` is preview-only; everything else maps 1:1.
  const { issues: _issues, ...rest } = row
  void _issues
  return rest
}

export function ProductImport({ existing }: { existing: ProductImportIndexEntry[] }) {
  const t = useTranslations("import")
  const tProduct = useTranslations("product")

  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [fileName, setFileName] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<ImportRowResult[] | null>(null)

  const existingByCode = useMemo(
    () => new Map(existing.map((entry) => [entry.productCode.toLowerCase(), entry])),
    [existing]
  )

  const counts = useMemo(() => {
    const out: Record<RowStatus, number> = { new: 0, update: 0, not_found: 0, duplicate: 0, error: 0 }
    for (const item of preview ?? []) out[item.status] += 1
    return out
  }, [preview])

  const importable = preview?.filter((item) => item.status !== "duplicate" && item.status !== "error") ?? []

  async function handleFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setResults(null)
    const parsed = parseProductWorkbook(await file.arrayBuffer())
    if (!parsed.ok) {
      setPreview(null)
      toast.error(parsed.error === "no_rows" ? t("noRows") : t("parseError"))
      return
    }
    setPreview(classify(parsed.rows, existingByCode))
  }

  async function runImport() {
    const rows = importable.map((item) => toPayload(item.row))
    const collected: ImportRowResult[] = []
    setProgress({ done: 0, total: rows.length })
    for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE)
      try {
        const result = await importProductsChunk(chunk)
        if (result.ok) collected.push(...result.results)
        else collected.push(...chunk.map((row) => ({ sourceRow: row.sourceRow, ok: false as const, error: result.error })))
      } catch {
        collected.push(...chunk.map((row) => ({ sourceRow: row.sourceRow, ok: false as const, error: "network" })))
      }
      setProgress({ done: Math.min(i + chunk.length, rows.length), total: rows.length })
    }
    setProgress(null)
    setResults(collected)
    const failed = collected.filter((r) => !r.ok).length
    if (failed === 0) toast.success(t("doneToast", { count: collected.length }))
    else toast.error(t("doneWithErrors", { failed }))
  }

  function downloadTemplate() {
    const blank = Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [TEMPLATE_HEADERS[c], ""]))
    exportToExcel("product-import-template", "Products", [
      {
        ...blank,
        [TEMPLATE_HEADERS.productName]: "Bunny hoodie",
        [TEMPLATE_HEADERS.audience]: "kids",
        [TEMPLATE_HEADERS.kind]: "single",
        [TEMPLATE_HEADERS.productType]: "Outerwear",
        [TEMPLATE_HEADERS.colors]: "Pink, White",
        [TEMPLATE_HEADERS.sizes]: "90cm, 100cm, 110cm",
        [TEMPLATE_HEADERS.unavailable]: "White/110cm",
        [TEMPLATE_HEADERS.sellPrice]: 490,
        [TEMPLATE_HEADERS.originalPrice]: 220,
        [TEMPLATE_HEADERS.status]: "active",
        [TEMPLATE_HEADERS.imageUrls]: "https://example.com/front.jpg, https://example.com/back.jpg",
      },
    ])
  }

  const issueLabel = (issue: RowIssue) => t(`issue.${issue}`)
  const busy = progress !== null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-card p-4">
        <p className="text-small text-muted-foreground">{t("templateHelp")}</p>
        <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
          <Download />
          {t("downloadTemplate")}
        </Button>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleFile(e.dataTransfer.files[0])
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input bg-card p-8 text-center transition-colors hover:border-primary focus-within:outline-2 focus-within:outline-primary",
          dragOver && "border-primary bg-primary/5",
          busy && "pointer-events-none opacity-60"
        )}
      >
        {fileName ? <FileSpreadsheet className="size-8 text-primary" /> : <Upload className="size-8 text-muted-foreground" />}
        <span className="text-body font-medium">{fileName || t("dropHint")}</span>
        {fileName && <span className="text-small text-muted-foreground">{t("selectFile")}</span>}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </label>

      {preview && !results && (
        <>
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border border-border bg-card/95 p-3 backdrop-blur">
            {(Object.keys(counts) as RowStatus[])
              .filter((status) => counts[status] > 0)
              .map((status) => (
                <span key={status} className={cn("rounded-full px-2.5 py-1 text-small font-medium", STATUS_STYLE[status])}>
                  {t(`status.${status}`)} · {counts[status]}
                </span>
              ))}
            <Button
              type="button"
              className="ml-auto"
              disabled={busy || importable.length === 0}
              onClick={runImport}
            >
              {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              {busy
                ? t("progress", { done: progress.done, total: progress.total })
                : t("importCount", { count: importable.length })}
            </Button>
            {busy && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full bg-primary transition-transform"
                  style={{ transform: `translateX(-${100 - (progress.done / Math.max(progress.total, 1)) * 100}%)` }}
                />
              </div>
            )}
          </div>

          <ul className="space-y-2">
            {preview.map((item) => (
              <PreviewCard key={item.row.sourceRow} item={item} issueLabel={issueLabel} />
            ))}
          </ul>
        </>
      )}

      {results && (
        <ResultsPanel
          results={results}
          onAgain={() => {
            setResults(null)
            setPreview(null)
            setFileName("")
          }}
          productsLabel={tProduct("list")}
        />
      )}
    </div>
  )
}

function PreviewCard({
  item,
  issueLabel,
}: {
  item: PreviewRow
  issueLabel: (issue: RowIssue) => string
}) {
  const t = useTranslations("import")
  const tProduct = useTranslations("product")
  const { row, status, existing } = item

  const sellChanged =
    status === "update" && row.sellPrice !== undefined && existing && Number(existing.sellPrice) !== row.sellPrice
  const costChanged =
    status === "update" &&
    row.originalPrice !== undefined &&
    existing &&
    Number(existing.originalPrice) !== row.originalPrice

  const sizes = row.variants ? Array.from(new Set(row.variants.map((v) => v.size))) : []
  const colors = row.variants ? Array.from(new Set(row.variants.map((v) => v.color))).filter((c) => c !== "-") : []
  const off = row.variants?.filter((v) => !v.isAvailable).length ?? 0

  return (
    <li
      className={cn(
        "grid gap-2 border border-border bg-card p-3 sm:grid-cols-[auto_1fr_auto]",
        (status === "duplicate" || status === "error") && "opacity-75"
      )}
    >
      <div className="flex items-start gap-2 sm:flex-col">
        <span className="text-small text-muted-foreground tabular-nums">
          {t("sourceRow")} {row.sourceRow}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-small font-medium whitespace-nowrap", STATUS_STYLE[status])}>
          {t(`status.${status}`)}
        </span>
      </div>

      <div className="min-w-0 space-y-1">
        <p className="truncate text-body font-bold">
          {row.productName ?? existing?.productName ?? "—"}
          <span className="ml-2 font-mono text-small font-normal text-muted-foreground">
            {status === "update" ? existing?.productCode : status === "new" || status === "not_found" ? t("codeOnSave") : row.productCode}
          </span>
        </p>
        <p className="text-small text-muted-foreground">
          {[
            row.audience && (row.audience === "kids" ? tProduct("audienceKids") : tProduct("audienceAdult")),
            row.kind && row.kind !== "single" && (row.kind === "set" ? tProduct("kindSet") : tProduct("kindFullset")),
            row.productType,
            colors.length > 0 && colors.join(", "),
            sizes.length > 0 && sizes.join(", "),
            off > 0 && t("offCount", { count: off }),
          ]
            .filter(Boolean)
            .join(" · ") || t("noVariantChange")}
        </p>

        {(sellChanged || costChanged) && existing && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
            {sellChanged && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {tProduct("sellPrice")} {formatBaht(Number(existing.sellPrice))} → {formatBaht(row.sellPrice!)}
              </span>
            )}
            {costChanged && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {tProduct("originalPrice")} {formatBaht(Number(existing.originalPrice))} → {formatBaht(row.originalPrice!)}
              </span>
            )}
            <span className="text-muted-foreground">{t("ordersUnaffected")}</span>
          </p>
        )}

        {status === "not_found" && <p className="text-small text-amber-800 dark:text-amber-300">{t("notFoundHint", { code: row.productCode })}</p>}
        {status === "duplicate" && <p className="text-small text-muted-foreground">{t("duplicateHint")}</p>}
        {item.issues.length > 0 && (
          <p className="flex items-start gap-1 text-small text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {item.issues.map(issueLabel).join(" · ")}
          </p>
        )}
      </div>

      <div className="flex items-start gap-3 text-small sm:flex-col sm:items-end">
        {row.sellPrice !== undefined && <span className="font-bold tabular-nums">{formatBaht(row.sellPrice)}</span>}
        <span className="flex items-center gap-1 text-muted-foreground">
          <ImageIcon className="size-3.5" />
          {row.imageUrls === undefined ? t("imagesKept") : t("imageCount", { count: row.imageUrls.length })}
        </span>
      </div>
    </li>
  )
}

function ResultsPanel({
  results,
  onAgain,
  productsLabel,
}: {
  results: ImportRowResult[]
  onAgain: () => void
  productsLabel: string
}) {
  const t = useTranslations("import")
  const created = results.filter((r) => r.ok && r.action === "created").length
  const updated = results.filter((r) => r.ok && r.action === "updated").length
  const failed = results.filter((r): r is Extract<ImportRowResult, { ok: false }> => !r.ok)
  const imageWarnings = results.reduce((sum, r) => sum + (r.ok ? r.imageWarnings : 0), 0)

  return (
    <section className="space-y-3 border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-h4 font-bold">
        <CheckCircle2 className="size-5 text-emerald-600" />
        {t("resultsTitle")}
      </h2>
      <p className="text-body">
        {t("created", { count: created })} · {t("updated", { count: updated })}
        {failed.length > 0 && <> · <span className="text-destructive">{t("failed", { count: failed.length })}</span></>}
      </p>
      {imageWarnings > 0 && (
        <p className="text-small text-amber-800 dark:text-amber-300">{t("imageWarnings", { count: imageWarnings })}</p>
      )}
      {failed.length > 0 && (
        <ul className="space-y-1 text-small text-destructive">
          {failed.map((r) => (
            <li key={r.sourceRow}>
              {t("sourceRow")} {r.sourceRow}: {t.has(`issue.${r.error}`) ? t(`issue.${r.error}`) : t("issue.write_failed")}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button render={<Link href="/admin/products" />} nativeButton={false}>
          {productsLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onAgain}>
          {t("importAnother")}
        </Button>
      </div>
    </section>
  )
}
