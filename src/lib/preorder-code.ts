/**
 * Guest-checkout preorder codes: `PO-XXXXXXXXXX`, 10 random symbols from a
 * 32-character alphabet.
 *
 * Contrast with `src/lib/product-code.ts`: product codes are sequential and
 * meaningful (`TS-001`, `TS-002`, ...), so they read `max + 1` inside the
 * caller's transaction. Preorder codes are random and meaningless by
 * design — printing a sequential, enumerable number on a public tracking URL
 * would let anyone page through every order in the shop just by incrementing
 * it. There is accordingly no database read here at all: a preorder code is
 * generated from `crypto.getRandomValues` alone.
 *
 * This file has NO `db` import and NO `server-only` on purpose:
 * `normalizePreorderCode` is called from the client-side `/track` lookup
 * form (see `src/app/[locale]/(shop)/track/page.tsx`) before any server
 * round trip, so garbage input is rejected instantly.
 *
 * ---------------------------------------------------------------------
 * WHY EXACTLY 32 SYMBOLS
 * ---------------------------------------------------------------------
 * `crypto.getRandomValues(new Uint8Array(n))` with `byte & 31` maps each
 * random byte uniformly onto 32 buckets (2^5) with ZERO modulo bias and no
 * rejection sampling needed — 256 is an exact multiple of 32. An alphabet of
 * 31 or 34 symbols would not divide 256 evenly, so mapping onto it fairly
 * would require a rejection loop (redraw discarded values) or ship a subtly
 * biased generator. The alphabet below has 32 characters:
 * `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` — digits and uppercase letters with `0`,
 * `1`, `I`, and `O` removed (the characters most often misread against the
 * digits `0`/`1`), leaving exactly 32 symbols.
 *
 * 10 characters x 5 bits/character = 50 bits of entropy = ~1.13 x 10^15
 * possible codes — comfortably unguessable for a public tracking URL with
 * no rate limiting in front of it (a deliberately accepted gap; see
 * docs/api-overview.md).
 *
 * ---------------------------------------------------------------------
 * COLLISION STRATEGY — generate-and-insert, retry on 23505
 * ---------------------------------------------------------------------
 * Same reasoning as `product-code.ts`'s header: a pre-flight `SELECT` to
 * check whether a generated code is already taken is a TOCTOU race (two
 * concurrent checkouts can both see "free" and then both insert). The
 * `orders_preorder_code_unique` index is the real authority — a caller
 * should catch a `23505` on that specific constraint (via
 * `isUniqueViolation(error, "orders_preorder_code_unique")` from
 * `src/lib/db-errors.ts`) and retry with a freshly generated code.
 *
 * IMPORTANT: a unique-violation error ABORTS the enclosing Postgres
 * transaction. You cannot catch the error and retry more statements on the
 * SAME `tx` — the whole `db.transaction(...)` call must be retried from
 * scratch. Callers (see `checkout/actions.ts` and `admin/orders/actions.ts`)
 * wrap the entire `db.transaction(...)` invocation in a bounded retry loop
 * (3 attempts), not just the insert statement.
 */

export const PREORDER_CODE_PREFIX = "PO-"

/** Exactly 32 symbols — no 0/1/I/O. The count is load-bearing (see the
 * file-level comment on unbiased byte-to-symbol mapping). */
export const PREORDER_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

export const PREORDER_CODE_LENGTH = 10

const CODE_PATTERN = new RegExp(
  `^${PREORDER_CODE_PREFIX}[${PREORDER_CODE_ALPHABET}]{${PREORDER_CODE_LENGTH}}$`
)

/** A fresh random preorder code, e.g. `PO-4F7K9XW2QA`. */
export function generatePreorderCode(): string {
  const bytes = new Uint8Array(PREORDER_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let body = ""
  for (const byte of bytes) {
    body += PREORDER_CODE_ALPHABET[byte & 31]
  }
  return `${PREORDER_CODE_PREFIX}${body}`
}

/**
 * Normalizes free-typed customer input (from the `/track` lookup form or a
 * pasted URL) into a canonical code, or `null` if it can never be valid.
 * Uppercases, strips whitespace and stray dashes, re-adds a missing `PO-`
 * prefix, then validates shape against the real alphabet.
 *
 * Deliberately does NO `0` -> `O` / `1` -> `I` confusable-character folding:
 * the alphabet was chosen specifically so nothing in it is confusable with
 * anything else, so there is nothing to fold.
 */
export function normalizePreorderCode(input: string): string | null {
  const upper = input.trim().toUpperCase()
  if (!upper) return null

  // Strip all whitespace and dashes, then re-add exactly one canonical
  // "PO-" prefix. This accepts "po1234567890", "PO 1234567890",
  // "po-1234-5678-90", etc. as the same code.
  const stripped = upper.replace(/[\s-]+/g, "")
  const body = stripped.startsWith("PO") ? stripped.slice(2) : stripped
  const candidate = `${PREORDER_CODE_PREFIX}${body}`

  return CODE_PATTERN.test(candidate) ? candidate : null
}
