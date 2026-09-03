import { z } from "zod"

/**
 * Validation shapes for orders and their line items. Same conventions as
 * `validations/product.ts` / carstockpro's `validations/car.ts`. See that
 * file's header comment for the general rules (Zod v4, terse error codes,
 * z.input/z.output exports).
 */

/** "" | null | undefined -> 0, otherwise Number(v). */
const money = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
  z.number({ message: "required" }).min(0, "min")
)

const emptyString = z.literal("").transform(() => "")

export const orderStatusValues = [
  "new",
  "source_shipped",
  "packed",
  "shipped",
  "completed",
  "cancelled",
] as const

// ---------------------------------------------------------------------------
// Line items — product fields are SNAPSHOTTED here (code/name/type/color/
// size/cost/price), matching the `orderItems` table: later edits to the
// product row must never rewrite an already-placed order. `productId` is
// only a soft link for reporting/reordering convenience, never the source
// of truth for what was actually sold.
// ---------------------------------------------------------------------------

export const orderItemSchema = z.object({
  productId: z.union([z.uuid(), z.literal("")]).optional(),
  productCode: z.string().trim().min(1, "required").max(40),
  productName: z.string().trim().min(1, "required").max(160),
  productType: z.string().trim().max(60).optional().or(emptyString),
  color: z.string().trim().max(40).optional().or(emptyString),
  size: z.string().trim().max(20).optional().or(emptyString),
  productCost: money,
  sellPrice: money,
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 1 : Number(v)),
    z.number({ message: "required" }).int("required").min(1, "min").max(9999, "max")
  ),
})

export type OrderItemValues = z.input<typeof orderItemSchema>
export type OrderItemParsed = z.output<typeof orderItemSchema>

// ---------------------------------------------------------------------------
// Order form — the multi-line order builder. `itemsTotal`/`itemsCost` are
// trigger-maintained and `totalCost`/`profit` are generated columns — the
// form previews them client-side from `items`, but nothing in this schema
// carries them; never send them in a write payload (Postgres rejects it).
// ---------------------------------------------------------------------------

export const orderFormSchema = z.object({
  orderDate: z.string().min(1, "required"),
  customerName: z.string().trim().min(1, "required").max(120),
  customerPhone: z.string().trim().max(30).optional().or(emptyString),
  customerAddress: z.string().trim().max(500).optional().or(emptyString),
  shippingCost: money,
  packingCost: money,
  status: z.enum(orderStatusValues).default("new"),
  note: z.string().trim().max(2000).optional().or(emptyString),
  items: z.array(orderItemSchema).min(1, "required").max(100),
})

export type OrderFormValues = z.input<typeof orderFormSchema>
export type OrderFormParsed = z.output<typeof orderFormSchema>
