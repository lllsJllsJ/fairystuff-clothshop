import { z } from "zod"

export const checkoutSchema = z.object({
  checkoutKey: z.uuid(),
  customerPhone: z.string().trim().min(5, "required").max(30),
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
