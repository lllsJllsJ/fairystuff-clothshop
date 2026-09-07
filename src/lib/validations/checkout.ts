import { z } from "zod"

import { isValidPhone, normalizePhone } from "@/lib/phone"

/**
 * Moved here from `validations/auth.ts` (guest checkout has no accounts, so
 * that file no longer needs a phone schema of its own). `min(1)` runs BEFORE
 * the transform so an empty field reports "required" rather than "invalid" —
 * `normalizePhone("")` returns `""`, which reaches the refine and fails
 * there, and telling a customer their blank phone is badly formatted sends
 * them looking for a typo that isn't there.
 */
export const normalizedPhoneSchema = z.string()
  .trim()
  .min(1, "required")
  .transform(normalizePhone)
  .refine(isValidPhone, "invalid")

export const checkoutSchema = z.object({
  checkoutKey: z.uuid(),
  customerFirstName: z.string().trim().min(1, "required").max(60, "max"),
  customerLastName: z.string().trim().min(1, "required").max(60, "max"),
  customerPhone: normalizedPhoneSchema,
  customerAddress: z.string().trim().min(5, "required").max(500),
  note: z.string().trim().max(2000).optional().default(""),
  items: z.array(z.object({
    productId: z.uuid(),
    productVariantId: z.uuid().nullable(),
    expectedSellPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(100),
})

export type CheckoutInput = z.input<typeof checkoutSchema>
