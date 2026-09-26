import "server-only"

import { eq, isNotNull, sql } from "drizzle-orm"

import { db } from "@/db"
import { orderItems, productTypes, products } from "@/db/schema"
import {
  KIND_CODE_PREFIX,
  RESERVED_CODE_PREFIXES,
  type ProductKind,
} from "@/lib/product-taxonomy"
import { isUniqueViolation } from "@/lib/db-errors"
import type { DbLike } from "@/lib/reference"

/**
 * Product codes are generated from the product's type, never typed by
 * hand: `<PREFIX>-<NNN>` — `TS-001`, `TS-002`, ... The prefix belongs to
 * the type (`product_types.code_prefix`) so every T-shirt shares one
 * sequence and a code says at a glance what it is.
 *
 * Sets and full sets are the exception: they are numbered in their own
 * series whatever their type — `SET-001`, `FULL-001` (KIND_CODE_PREFIX in
 * src/lib/product-taxonomy.ts). Those two prefixes are reserved, so
 * `derivePrefix` never hands them to a type.
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
 * The next unused code for a product. Returns null when a single item has
 * no type yet — the form uses that to show "assigned on save" until the
 * owner picks one. Sets and full sets never need a type.
 */
export async function nextProductCode(
  productType: string | null | undefined,
  kind: ProductKind = "single"
): Promise<string | null> {
  return nextProductCodeIn(db, productType, kind)
}

/**
 * Same, but inside a caller's transaction — used by `createProduct` so the
 * code is minted with the same client that inserts the row.
 */
export async function nextProductCodeIn(
  tx: DbLike,
  productType: string | null | undefined,
  kind: ProductKind = "single"
): Promise<string | null> {
  const prefix = await prefixFor(tx, productType, kind)
  if (!prefix) return null
  return `${prefix}-${String(await nextSequence(tx, prefix)).padStart(SEQUENCE_PAD, "0")}`
}

async function prefixFor(
  client: DbLike,
  productType: string | null | undefined,
  kind: ProductKind
): Promise<string | null> {
  if (kind !== "single") return KIND_CODE_PREFIX[kind]
  const name = productType?.trim()
  if (!name) return null
  return codePrefixFor(client, name)
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
  takenByTypes: Set<string>
): string {
  const taken = new Set([...takenByTypes, ...RESERVED_CODE_PREFIXES])
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

/** How many times a create re-mints its code after losing a race. */
const CODE_ATTEMPTS = 5

/** `TS-007` + 2 -> `TS-009`; leaves an unparseable code untouched. */
export function bumpCode(code: string, by: number): string {
  const match = code.match(/^(.*-)(\d+)$/)
  if (!match) return code
  const width = match[2].length
  return `${match[1]}${String(Number(match[2]) + by).padStart(width, "0")}`
}

/**
 * Runs a create, retrying only a unique violation — the one failure a
 * generated code can hit when two creates read the same highest number at
 * once. The callback gets the attempt number so it can `bumpCode` past the
 * collision. Any other error propagates on the first attempt.
 */
export async function withCodeRetry<T>(run: (attempt: number) => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    try {
      return await run(attempt)
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      lastError = error
    }
  }
  throw lastError
}
