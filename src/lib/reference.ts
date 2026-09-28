import "server-only"

import { eq, max } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import { productColors, productTypes } from "@/db/schema"
import type * as schema from "@/db/schema"
import { toEnglishColor } from "@/lib/colors"
import { derivePrefix } from "@/lib/product-code"

/**
 * Accepts either `db` (src/db/index.ts) or a `tx` client from
 * `db.transaction(async (tx) => ...)`. Both are the same Drizzle type under
 * the pooled node-postgres driver, so one alias covers both — no `any`.
 *
 * Pass whichever the caller already has open: inside a product-write
 * transaction pass `tx`, so this insert lands atomically with the write that
 * triggered it; for a standalone call, `db` is fine.
 */
export type DbLike = NodePgDatabase<typeof schema>

/** sortOrder for a type discovered from free-typed input, kept below the
 * curated seed list (see scripts/seed.ts) so learned entries sort last. */
const LEARNED_SORT_ORDER = 999

/**
 * Adds a product's type to the managed `productTypes` reference list when
 * it isn't there yet, so a free-typed value becomes a suggested option
 * next time. Port of carstockpro's `learnCarReference`, flattened from 3
 * levels (brand/model/sub_model) to clothshop's single `productType`
 * level.
 *
 * Best-effort: the reference list is a convenience only, so a failure here
 * must NEVER fail the product write that triggered it. The product row
 * itself is always the source of truth.
 */
export async function learnProductType(
  db: DbLike,
  productType: string | null | undefined
): Promise<void> {
  const name = productType?.trim()
  if (!name) return

  try {
    const existing = await db
      .select({ id: productTypes.id })
      .from(productTypes)
      .where(eq(productTypes.name, name))
      .limit(1)
    if (existing.length > 0) return

    // Give the new type its own code prefix immediately, avoiding any
    // prefix already claimed — otherwise the first product of this type
    // would derive one at save time and could collide mid-write.
    const claimed = await db
      .select({ codePrefix: productTypes.codePrefix })
      .from(productTypes)
    const taken = new Set(
      claimed
        .map((row) => (row.codePrefix ?? "").toUpperCase())
        .filter(Boolean)
    )

    await db.insert(productTypes).values({
      name,
      slug: slugify(name),
      codePrefix: derivePrefix(null, slugify(name), name, taken),
      sortOrder: LEARNED_SORT_ORDER,
    })
  } catch {
    // Non-fatal — see the doc comment above.
  }
}

/** The one-colour sentinel on productVariants.color — never a palette entry. */
const NO_COLOR = "-"

/**
 * Adds any colour a product was saved with to the `productColors` palette,
 * so a colour typed in the product editor's picker becomes an option next
 * time — this is what makes "add a new colour" work from the product page
 * without a trip to Settings. Appended after the existing palette.
 *
 * Best-effort, exactly like learnProductType: a failure never fails the
 * product write that triggered it.
 */
export async function learnProductColors(db: DbLike, colors: string[]): Promise<void> {
  const names = Array.from(
    new Set(colors.map((c) => toEnglishColor(c)).filter((c) => c && c !== NO_COLOR))
  )
  if (names.length === 0) return

  try {
    const [last] = await db.select({ value: max(productColors.sortOrder) }).from(productColors)
    const start = (last?.value ?? -1) + 1
    await db
      .insert(productColors)
      .values(names.map((name, i) => ({ name, sortOrder: start + i })))
      .onConflictDoNothing({ target: productColors.name })
  } catch {
    // Non-fatal — see the doc comment above.
  }
}

/** Best-effort slug for a learned type name. Preserves Thai characters
 * (most type names are Thai) alongside ASCII; a collision on the unique
 * `slug` index just fails this best-effort insert, which is caught above. */
function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || `type-${Date.now()}`
}
