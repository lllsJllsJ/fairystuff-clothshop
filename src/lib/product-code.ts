import "server-only"

import { eq, isNotNull, sql } from "drizzle-orm"

import { db } from "@/db"
import { orderItems, productTypes, products } from "@/db/schema"
import type { DbLike } from "@/lib/reference"

/**
 * Product codes are generated from the product's type, never typed by
 * hand: `<PREFIX>-<NNN>` — `TS-001`, `TS-002`, ... The prefix belongs to
 * the type (`product_types.code_prefix`) so every T-shirt shares one
 * sequence and a code says at a glance what it is.
 *
 * ---------------------------------------------------------------------
 * WHY THE SERVER OWNS THIS
 * ---------------------------------------------------------------------
 * The form shows a PREVIEW (`previewProductCode`), but `createProduct`
 * generates the real code itself and ignores whatever the client sent —
 * a read-only input is a UI courtesy, not a guarantee, and this app has no
 * RLS backstop. The `lower(product_code)` unique index is the final
 * authority: a racing create raises 23505 and the action retries with the
 * next number.
 *
 * ---------------------------------------------------------------------
 * CODES ARE IMMUTABLE ONCE ASSIGNED
 * ---------------------------------------------------------------------
 * `updateProduct` never regenerates one, even if the owner changes the
 * product's type. The code is the storefront's URL key
 * (`/shop/<code>`) and is snapshotted onto every order line
 * (`orderItems.productCode`, which the profit report groups on) — silently
 * renumbering a product would break customer-facing links and orphan its
 * own sales history.
 */

/** Digits in the running number: `TS-001`. Overflows to 4+ digits at 1000. */
const SEQUENCE_PAD = 3
/** Fallback when a type has no usable letters at all (e.g. a Thai-only name). */
const FALLBACK_PREFIX = "PR"
const MAX_PREFIX_LENGTH = 6

/**
 * The next unused code for a product type. Returns null when no type is
 * selected — the form uses that to keep the code field empty until the
 * owner picks one.
 */
export async function nextProductCode(
  productType: string | null | undefined
): Promise<string | null> {
  const name = productType?.trim()
  if (!name) return null

  const prefix = await codePrefixFor(db, name)
  return `${prefix}-${String(await nextSequence(db, prefix)).padStart(SEQUENCE_PAD, "0")}`
}

/**
 * Same, but inside a caller's transaction — used by `createProduct` so the
 * code is minted with the same client that inserts the row.
 */
export async function nextProductCodeIn(
  tx: DbLike,
  productType: string | null | undefined
): Promise<string | null> {
  const name = productType?.trim()
  if (!name) return null
  const prefix = await codePrefixFor(tx, name)
  return `${prefix}-${String(await nextSequence(tx, prefix)).padStart(SEQUENCE_PAD, "0")}`
}

/**
 * This type's stored prefix, deriving and persisting one the first time a
 * type needs it (a row that predates the column, or one learned from
 * free-typed input). A type that isn't in the reference list at all still
 * gets a code — the prefix is derived on the fly and simply not stored.
 */
async function codePrefixFor(client: DbLike, typeName: string): Promise<string> {
  const [row] = await client
    .select({
      id: productTypes.id,
      name: productTypes.name,
      nameEn: productTypes.nameEn,
      slug: productTypes.slug,
      codePrefix: productTypes.codePrefix,
    })
    .from(productTypes)
    .where(eq(productTypes.name, typeName))
    .limit(1)

  if (row?.codePrefix) return row.codePrefix

  const taken = await takenPrefixes(client)
  const prefix = derivePrefix(
    row?.nameEn ?? null,
    row?.slug ?? null,
    row?.name ?? typeName,
    taken
  )

  if (row) {
    // Best-effort: losing this race just means the next call derives again.
    try {
      await client
        .update(productTypes)
        .set({ codePrefix: prefix })
        .where(eq(productTypes.id, row.id))
    } catch {
      // A concurrent write claimed the prefix; the code below is still
      // unique because the sequence is checked against real product codes.
    }
  }

  return prefix
}

async function takenPrefixes(client: DbLike): Promise<Set<string>> {
  const rows = await client
    .select({ codePrefix: productTypes.codePrefix })
    .from(productTypes)
    .where(isNotNull(productTypes.codePrefix))
  return new Set(rows.map((r) => (r.codePrefix ?? "").toUpperCase()))
}

/**
 * Builds a short ASCII key from whichever name has usable letters —
 * English name first (`T-Shirt` -> `TS`), then slug, then the Thai name
 * (which usually yields nothing, hence the fallback). Collisions against
 * prefixes already in use are resolved by widening (`SH` -> `SHI`) and
 * finally by appending a digit, so "Shirt" and "Shorts" never share a
 * sequence.
 *
 * Exported for the seed script and tests; `codePrefixFor` is the normal
 * entry point.
 */
export function derivePrefix(
  nameEn: string | null,
  slug: string | null,
  name: string,
  taken: Set<string>
): string {
  for (const candidate of candidatesFrom(nameEn, slug, name)) {
    if (!taken.has(candidate)) return candidate
  }

  // Everything reasonable is taken — append the first free digit.
  const base = candidatesFrom(nameEn, slug, name)[0] ?? FALLBACK_PREFIX
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}${n}`.slice(0, MAX_PREFIX_LENGTH)
    if (!taken.has(candidate)) return candidate
  }
  return `${FALLBACK_PREFIX}${Date.now() % 1000}`
}

/**
 * Ordered prefix candidates for one type, best first: initials of a
 * multi-word name (`Crop Top` -> `CT`), then the first two/three letters
 * of the first word (`Shirt` -> `SH`, then `SHI`).
 */
function candidatesFrom(
  nameEn: string | null,
  slug: string | null,
  name: string
): string[] {
  const out: string[] = []

  for (const source of [nameEn, slug, name]) {
    const words = (source ?? "")
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean)
    if (words.length === 0) continue

    if (words.length > 1) {
      out.push(words.map((w) => w[0]).join("").slice(0, MAX_PREFIX_LENGTH))
    }
    for (const length of [2, 3, 4]) {
      if (words[0].length >= length) out.push(words[0].slice(0, length))
    }
  }

  return out.length > 0 ? Array.from(new Set(out)) : [FALLBACK_PREFIX]
}

/**
 * One past the highest number this prefix has EVER used — counting both
 * live products and historical order lines.
 *
 * Order lines snapshot `productCode` (see the schema comment on
 * `orderItems`) and `reports.ts#profitByProduct` groups on that snapshot
 * precisely so a deleted product's sales survive it. Numbering only from
 * live products would hand a deleted product's code to a new one, and its
 * history would silently merge into the newcomer's report row. Reading the
 * order lines too makes a retired code stay retired.
 */
async function nextSequence(client: DbLike, prefix: string): Promise<number> {
  const upper = prefix.toUpperCase()
  const pattern = `^${upper}-([0-9]+)$`

  const result = await client.execute<{ max_sequence: number | null }>(sql`
    select max(sequence) as max_sequence from (
      select cast(substring(upper(${products.productCode}) from ${pattern}) as integer) as sequence
        from ${products}
       where upper(${products.productCode}) like ${`${upper}-%`}
      union all
      select cast(substring(upper(${orderItems.productCode}) from ${pattern}) as integer) as sequence
        from ${orderItems}
       where upper(${orderItems.productCode}) like ${`${upper}-%`}
    ) used
  `)

  const highest = result.rows[0]?.max_sequence
  return highest && Number.isFinite(Number(highest)) ? Number(highest) + 1 : 1
}
