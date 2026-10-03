import { z } from "zod"

import { MAX_POPULAR_PRODUCTS, PRODUCT_AUDIENCES, PRODUCT_KINDS } from "@/lib/product-taxonomy"
import { MAX_SIZE_LENGTH } from "@/lib/sizes"

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

const emptyString = z.literal("").transform(() => "")

const optionalDays = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().int("required").min(1, "min").max(3650, "max").optional()
)

// ---------------------------------------------------------------------------
// Variants — one row per colour x size combination. No stock count: this is
// a preorder shop, so a variant is simply available (orderable) or not.
// `size` is free text — presets in src/lib/sizes.ts are shortcuts only.
// ---------------------------------------------------------------------------

export const productVariantSchema = z.object({
  id: z.uuid().optional(),
  color: z.string().trim().min(1, "required").max(40),
  size: z.string().trim().min(1, "required").max(MAX_SIZE_LENGTH),
  isAvailable: z.boolean().default(true),
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
  audience: z.enum(PRODUCT_AUDIENCES).default("adult"),
  kind: z.enum(PRODUCT_KINDS).default("single"),
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

/** A single item's code comes from its type's prefix, so it needs a type;
 * sets and full sets are numbered in their own series and don't. */
function validateTypeForKind(
  value: { kind?: string; productType?: string },
  context: z.RefinementCtx
) {
  if ((value.kind ?? "single") === "single" && !value.productType?.trim()) {
    context.addIssue({ code: "custom", path: ["productType"], message: "type_required" })
  }
}

export const productFormSchema = productFormObject
  .superRefine(validatePreorderRange)
  .superRefine(validateTypeForKind)

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
  status: true,
})

export type ProductInlineUpdateValues = z.input<typeof productInlineUpdateSchema>
export type ProductInlineUpdateParsed = z.output<typeof productInlineUpdateSchema>

// ---------------------------------------------------------------------------
// Import — one row of the import/export template (src/lib/import/
// product-template.ts), re-validated on the server. Optional fields are
// genuinely optional: absent = "leave the existing value" on an update.
// ---------------------------------------------------------------------------

const optionalText = (max: number) => z.string().trim().max(max).optional()
const optionalMoney = z.number().min(0).max(10_000_000).optional()

export const productImportRowSchema = z.object({
  sourceRow: z.number().int().min(1),
  productCode: z.string().trim().max(40).default(""),
  productName: optionalText(160),
  audience: z.enum(PRODUCT_AUDIENCES).optional(),
  kind: z.enum(PRODUCT_KINDS).optional(),
  productType: optionalText(60),
  variants: z
    .array(
      z.object({
        color: z.string().trim().min(1).max(40),
        size: z.string().trim().min(1).max(MAX_SIZE_LENGTH),
        isAvailable: z.boolean(),
      })
    )
    .max(120)
    .refine(
      (variants) => new Set(variants.map(variantDedupeKey)).size === variants.length,
      "duplicate_variant"
    )
    .optional(),
  sellPrice: optionalMoney,
  originalPrice: optionalMoney,
  buyingSource: optionalText(160),
  sourceLink: z.url().max(500).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  description: optionalText(2000),
  imageUrls: z.array(z.url().max(2000)).max(20).optional(),
})

export type ProductImportRow = z.input<typeof productImportRowSchema>
export type ProductImportRowParsed = z.output<typeof productImportRowSchema>

/** Rows per server call — small, because each row may download images. */
export const IMPORT_CHUNK_SIZE = 5

export const productImportChunkSchema = z
  .array(productImportRowSchema)
  .min(1, "required")
  .max(IMPORT_CHUNK_SIZE, "max")

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

// ---------------------------------------------------------------------------
// Popular — the hand-picked list saved from Settings -> Storefront. The
// array IS the display order (index 0 shows first), so it is never sorted or
// deduplicated here: a duplicate id is a client bug and is rejected.
// ---------------------------------------------------------------------------

export const popularProductIdsSchema = z
  .array(z.uuid())
  .max(MAX_POPULAR_PRODUCTS, "max")
  .refine((ids) => new Set(ids).size === ids.length, "duplicate")

// ---------------------------------------------------------------------------
// Storefront order — the full arranged list saved from admin/products/arrange.
// Index 0 shows first. An empty list is valid: it resets the catalogue to
// newest-first. The cap is a sanity bound on one request, not a product limit
// the owner should ever meet.
// ---------------------------------------------------------------------------

export const MAX_ARRANGED_PRODUCTS = 2000

export const productOrderIdsSchema = z
  .array(z.uuid())
  .max(MAX_ARRANGED_PRODUCTS, "max")
  .refine((ids) => new Set(ids).size === ids.length, "duplicate")
