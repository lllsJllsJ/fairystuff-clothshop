import { z } from "zod"

import { fromBangkokInput, MAX_DISCOUNT_PERCENT, MIN_DISCOUNT_PERCENT } from "@/lib/pricing"

/**
 * `datetime-local` text (Bangkok time) or blank -> Date | null. Also accepts
 * an already-parsed Date/null: react-hook-form's zodResolver hands the
 * PARSED values to onSubmit, and the server action parses them again — so
 * this must be idempotent, like every other field in these schemas.
 */
export const bangkokDateTime = z.union([
  z.date().transform((d): Date | null => d),
  z.null().transform((): Date | null => null),
  z
    .string()
    .trim()
    .max(25)
    .refine((v) => v === "" || fromBangkokInput(v) != null, "invalid_date")
    .transform((v) => fromBangkokInput(v)),
])

const optionalNumber = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : v.trim() === "" ? null : Number(v)))
  .refine((v) => v == null || Number.isFinite(v), "invalid_number")

/** Mirrors the shop_settings_sale_label_length_check constraint. */
export const MAX_SALE_LABEL_LENGTH = 40

export function windowOk(v: { startsAt: Date | null; endsAt: Date | null }): boolean {
  return !v.startsAt || !v.endsAt || v.endsAt.getTime() > v.startsAt.getTime()
}

/** Settings -> Discount (the shop-wide % sale). */
export const shopSaleSchema = z
  .object({
    enabled: z.boolean(),
    percent: optionalNumber,
    startsAt: bangkokDateTime,
    endsAt: bangkokDateTime,
    /** Banner label replacing "SALE" — blank = default. */
    labelTh: z.string().trim().max(MAX_SALE_LABEL_LENGTH, "label_length").default(""),
    labelEn: z.string().trim().max(MAX_SALE_LABEL_LENGTH, "label_length").default(""),
  })
  .refine(
    (v) => v.percent == null || (v.percent >= MIN_DISCOUNT_PERCENT && v.percent <= MAX_DISCOUNT_PERCENT),
    { path: ["percent"], message: "percent_range" }
  )
  .refine((v) => !v.enabled || v.percent != null, { path: ["percent"], message: "percent_required" })
  .refine(windowOk, { path: ["endsAt"], message: "window_order" })

export type ShopSaleInput = z.input<typeof shopSaleSchema>
