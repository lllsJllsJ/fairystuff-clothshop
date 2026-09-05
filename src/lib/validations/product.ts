import { z } from "zod"

/**
 * Validation shapes for products, variants, images, and Excel imports.
 * Follows carstockpro's `src/lib/validations/car.ts` conventions exactly:
 * preprocessors that coerce empty-string form inputs, `z.input`/`z.output`
 * type exports (input = what react-hook-form holds before parsing, output =
 * what the server action gets after `safeParse`), and terse error codes
 * (`"required"`, `"min"`, `"duplicate_variant"`) that the UI maps through
 * next-intl rather than displaying directly.
 *
 * Zod v4 is installed — this file uses top-level `z.url()` / `z.uuid()`,
 * NOT carstockpro's v3-era `z.string().url()`.
 */

/** "" | null | undefined -> 0, otherwise Number(v). Money fields are never
 * nullable in this schema — an empty price input means "not set yet", not
 * "unknown", so it collapses to 0 rather than null. */
const money = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
  z.number({ message: "required" }).min(0, "min")
)

/**
 * "" | null | undefined -> 0, otherwise Number(v). Used for variant
 * quantities: always required (a variant row always has *some* quantity,
 * even if 0 — that's how a colour/size combination is marked sold out),
 * always an integer, capped well above anything a real stock room needs.
 */
const count = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
  z.number({ message: "required" }).int("required").min(0, "min").max(100_000, "max")
)

const emptyString = z.literal("").transform(() => "")

const optionalDays = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().int("required").min(1, "min").max(3650, "max").optional()
)

// ---------------------------------------------------------------------------
// Variants — one row per colour x size combination.
// ---------------------------------------------------------------------------

export const productVariantSchema = z.object({
  id: z.uuid().optional(),
  color: z.string().trim().min(1, "required").max(40),
  size: z.string().trim().min(1, "required").max(20),
  quantity: count,
  sku: z.string().trim().max(60).optional().or(emptyString),
  sortOrder: z.number().int().min(0).default(0),
})

export type ProductVariantValues = z.input<typeof productVariantSchema>
export type ProductVariantParsed = z.output<typeof productVariantSchema>

/** Case-insensitive (colour, size) key used to detect duplicate variant
 * rows in a single product's matrix. */
function variantDedupeKey(v: { color: string; size: string }): string {
  return `${v.color.trim().toLowerCase()}|${v.size.trim().toLowerCase()}`
}

// ---------------------------------------------------------------------------
// Product form — full create/edit. originalPrice/buyingSource/sourceLink
// are owner-only fields; the form that renders this schema simply never
// shows them to a non-owner, but the schema itself doesn't know about
// roles — that enforcement lives in the server action (see plan Risk 1).
// ---------------------------------------------------------------------------

const productFormObject = z.object({
  // A create generates its code server-side. The preview may still be empty
  // when the owner submits, so it must never block an otherwise valid form.
  productCode: z.string().trim().max(40),
  productName: z.string().trim().min(1, "required").max(160),
  productType: z.string().trim().max(60).optional().or(emptyString),
  description: z.string().trim().max(2000).optional().or(emptyString),
  sellPrice: money,
  originalPrice: money,
  buyingSource: z.string().trim().max(160).optional().or(emptyString),
  sourceLink: z.union([z.url().max(500), emptyString]).optional(),
  preorderMinDays: optionalDays,
  preorderMaxDays: optionalDays,
  characterIds: z.array(z.uuid()).max(30).default([]),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  variants: z
    .array(productVariantSchema)
    .max(120)
    .default([])
    .refine(
      (variants) =>
        new Set(variants.map(variantDedupeKey)).size === variants.length,
      "duplicate_variant"
    ),
})

function validatePreorderRange(
  value: { preorderMinDays?: number; preorderMaxDays?: number },
  context: z.RefinementCtx
) {
  const hasMin = value.preorderMinDays !== undefined
  const hasMax = value.preorderMaxDays !== undefined
  if (hasMin !== hasMax) {
    context.addIssue({ code: "custom", path: [hasMin ? "preorderMaxDays" : "preorderMinDays"], message: "required" })
  } else if (hasMin && hasMax && value.preorderMinDays! > value.preorderMaxDays!) {
    context.addIssue({ code: "custom", path: ["preorderMaxDays"], message: "range" })
  }
}

export const productFormSchema = productFormObject.superRefine(validatePreorderRange)

export type ProductFormValues = z.input<typeof productFormSchema>
export type ProductFormParsed = z.output<typeof productFormSchema>

// ---------------------------------------------------------------------------
// Inline update — the quick edits made directly in the admin product table.
// Picked from the full form schema so the two never drift apart on shared
// fields. Deliberately excludes `variants`, `description`, `buyingSource`,
// and `sourceLink` — those stay on the full edit form.
// ---------------------------------------------------------------------------

export const productInlineUpdateSchema = productFormObject.pick({
  productCode: true,
  productName: true,
  productType: true,
  sellPrice: true,
  originalPrice: true,
  preorderMinDays: true,
  preorderMaxDays: true,
  status: true,
}).superRefine(validatePreorderRange)

export type ProductInlineUpdateValues = z.input<typeof productInlineUpdateSchema>
export type ProductInlineUpdateParsed = z.output<typeof productInlineUpdateSchema>

// ---------------------------------------------------------------------------
// Excel import — one confirmed row after the owner has edited the preview.
// Looser than the product form: only productCode is required, since a
// partially-filled sheet must not block the whole import.
// ---------------------------------------------------------------------------

export const productImportRowSchema = z.object({
  productCode: z.string().trim().min(1, "required").max(40),
  productName: z.string().trim().max(160).optional().or(emptyString),
  productType: z.string().trim().max(60).optional().or(emptyString),
  sellPrice: money,
  originalPrice: money,
  buyingSource: z.string().trim().max(160).optional().or(emptyString),
  sourceLink: z.union([z.url().max(500), emptyString]).optional(),
  variants: z.array(productVariantSchema.omit({ id: true })).max(120).default([]),
})

export type ProductImportRow = z.input<typeof productImportRowSchema>
export type ProductImportRowParsed = z.output<typeof productImportRowSchema>

export const productImportSchema = z
  .array(productImportRowSchema)
  .min(1, "required")
  .max(1000, "max")

// ---------------------------------------------------------------------------
// Product images — validated payload for attaching an already-uploaded R2
// image to a product. `url`/`storageKey` come back from the presign +
// upload flow (lib/r2.ts); this schema only validates the shape before it
// is written to `productImages`.
// ---------------------------------------------------------------------------

export const productImageSchema = z.object({
  // Product images are served through the same-origin private-bucket proxy.
  // Do not accept an arbitrary client-supplied URL here: the storage key is
  // the source of truth and the URL must point to that exact key.
  url: z.string().trim().max(600),
  storageKey: z.string().trim().regex(
    /^products\/[0-9a-f-]{36}\/[a-zA-Z0-9-]+-(?:480|800|1600)\.webp$/,
    "invalid"
  ),
  alt: z.string().trim().max(200).optional().or(emptyString),
  color: z.string().trim().max(40).optional().or(emptyString),
  sortOrder: z.number().int().min(0),
}).superRefine((image, context) => {
  if (image.url !== `/api/images/${image.storageKey}`) {
    context.addIssue({ code: "custom", path: ["url"], message: "invalid" })
  }
})

export type ProductImageInput = z.infer<typeof productImageSchema>
