import { z } from "zod"

export const CATALOG_MANIFEST_VERSION = 1 as const
export const CATALOG_STATUS = "active" as const
export const CATALOG_SIZE = "Free Size" as const
export const CATALOG_QUANTITY = 99 as const

export const CATALOG_PRODUCT_TYPES = [
  "เสื้อยืด",
  "เสื้อเชิ้ต",
  "เสื้อครอป",
  "เดรส",
  "กระโปรง",
  "กางเกงขายาว",
  "กางเกงขาสั้น",
  "เสื้อคลุม",
  "เซ็ต",
  "เครื่องประดับ",
  "รองเท้า",
  "กระเป๋า",
  "ชุดกีฬา",
] as const

export const catalogImageSchema = z.object({
  localPath: z.string().min(1),
  sourceUrl: z.url().nullable(),
  provenance: z.enum(["supplier", "workbook", "reviewed"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  color: z.string().trim().min(1).max(40),
})

export const catalogProductSchema = z.object({
  workbookRow: z.number().int().min(2),
  /** Audit/grouping reference only. It is never inserted as productCode. */
  workbookRef: z.string().trim().min(1),
  sourceIdentity: z.string().trim().min(1),
  sourceLink: z.url().max(500).nullable(),
  sourceTitle: z.string().trim().nullable(),
  productName: z.string().trim().min(1).max(160),
  productType: z.enum(CATALOG_PRODUCT_TYPES),
  description: z.string().trim().max(2000).nullable(),
  originalPrice: z.number().finite().min(0),
  sellPrice: z.number().finite().min(0),
  buyingSource: z.string().trim().max(160).nullable(),
  status: z.literal(CATALOG_STATUS),
  color: z.string().trim().min(1).max(40),
  imagePolicy: z.enum(["required", "temporary-none"]),
  // `temporary-none` is an explicit reviewed exception, never an implicit
  // fallback. All other products must retain at least one image.
  images: z.array(catalogImageSchema),
  warnings: z.array(z.string()),
})

export const catalogManifestSchema = z.object({
  version: z.literal(CATALOG_MANIFEST_VERSION),
  sourceWorkbook: z.string().min(1),
  sourceWorkbookSha256: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.iso.datetime(),
  products: z.array(catalogProductSchema).length(53),
})

export type CatalogImage = z.infer<typeof catalogImageSchema>
export type CatalogProduct = z.infer<typeof catalogProductSchema>
export type CatalogManifest = z.infer<typeof catalogManifestSchema>
export type CatalogProductType = (typeof CATALOG_PRODUCT_TYPES)[number]

export function validateCatalogManifest(value: unknown): CatalogManifest {
  return catalogManifestSchema.parse(value)
}
