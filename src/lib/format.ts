/** Formatting helpers for money, numbers, and dates (Thai Baht). */

export function formatBaht(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(n)
}

/** Compact money for tight spaces, e.g. ฿1.2M / ฿450K. */
export function formatBahtCompact(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("th-TH").format(Number(value ?? 0))
}

export function formatDate(
  value: string | Date | null | undefined,
  locale = "th-TH"
): string {
  if (!value) return "-"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "-"
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d)
}

export function formatDateTime(
  value: string | Date | null | undefined,
  locale = "th-TH"
): string {
  if (!value) return "-"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "-"
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

/** Year-month key, e.g. "2026-07". */
export function monthKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
