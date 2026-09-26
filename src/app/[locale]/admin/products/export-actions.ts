"use server"

import { getProducts, type ProductStatusValue } from "@/db/queries/products"
import { getCurrentUser } from "@/lib/auth-helpers"
import { toTemplateRow } from "@/lib/import/product-template"
import { isProductAudience, isProductKind } from "@/lib/product-taxonomy"
import { isOwner } from "@/lib/roles"

/** Hard ceiling for one export — far above a boutique catalogue. */
const MAX_EXPORT_ROWS = 5000

export type ExportFilters = {
  search?: string
  status?: ProductStatusValue | "all"
  type?: string
  audience?: string
  kind?: string
}

export type ExportResult =
  | { ok: true; rows: Record<string, string | number>[] }
  | { ok: false; error: string }

/**
 * Every product matching the admin list's current filters, as rows of the
 * import template (src/lib/import/product-template.ts) — so the file can
 * be edited and imported straight back as an upsert. Image URLs are
 * absolute so they survive being opened anywhere; re-importing them
 * matches the existing photos instead of downloading copies.
 *
 * Owner-only: this includes cost price, source, and source link.
 */
export async function exportProducts(filters: ExportFilters = {}): Promise<ExportResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const status = filters.status
  try {
    const { rows } = await getProducts({
      search: typeof filters.search === "string" ? filters.search.slice(0, 200) : "",
      status: status === "draft" || status === "active" || status === "archived" ? status : "all",
      type: typeof filters.type === "string" && filters.type ? filters.type : undefined,
      audience: isProductAudience(filters.audience) ? filters.audience : undefined,
      kind: isProductKind(filters.kind) ? filters.kind : undefined,
      sort: "oldest",
      page: 1,
      pageSize: MAX_EXPORT_ROWS,
    })

    const origin =
      (process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL || "http://localhost:3000").replace(
        /\/+$/,
        ""
      )
    return {
      ok: true,
      rows: rows.map((product) =>
        toTemplateRow({
          ...product,
          variants: [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder),
          imageUrls: [...product.images]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((image) => new URL(image.url, origin).toString()),
        })
      ),
    }
  } catch (error) {
    console.error("exportProducts failed", error)
    return { ok: false, error: "export_failed" }
  }
}
