/**
 * Actual-vs-master cost comparison for order lines and order totals.
 * Preorder supplier prices drift, so the owner overrides each line's
 * actual cost; this measures how far that landed from the catalogue
 * (master) cost. Positive = paid more than planned.
 */

export type CostVariance = {
  /** actual − master, rounded to satang. */
  diff: number
  /** diff / master × 100, or null when master is 0 (no baseline). */
  percent: number | null
  tone: "over" | "under" | "same"
}

export function costVariance(actual: number, master: number): CostVariance {
  const diff = Math.round((actual - master) * 100) / 100
  const percent = master > 0 ? Math.round((diff / master) * 1000) / 10 : null
  const tone = diff > 0 ? "over" : diff < 0 ? "under" : "same"
  return { diff, percent, tone }
}

/** "+฿15 (+12.5%)" / "−฿8 (−4%)" — sign always shown. */
export function formatVariance(variance: CostVariance, formatMoney: (value: number) => string): string {
  const sign = variance.diff > 0 ? "+" : variance.diff < 0 ? "−" : ""
  const money = `${sign}${formatMoney(Math.abs(variance.diff))}`
  if (variance.percent === null) return money
  return `${money} (${sign}${Math.abs(variance.percent)}%)`
}
