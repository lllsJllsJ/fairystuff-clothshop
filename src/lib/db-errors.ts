/**
 * Shared Postgres error-shape helpers. Extracted from the (now deleted)
 * `account/profile/actions.ts`, which had a private, narrower copy of
 * `isUniqueViolation` — this version additionally accepts an optional
 * `constraint` name so a caller can distinguish which unique index fired
 * (e.g. `preorder-code.ts` needs to know it was specifically the
 * `orders_preorder_code_unique` constraint, not some unrelated collision, to
 * decide whether a retry with a new code is warranted).
 *
 * node-postgres attaches the raw driver error as `cause` on the error
 * `drizzle-orm` throws, so this walks a few levels of `.cause` looking for
 * Postgres's `23505` (unique_violation) SQLSTATE code.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "object" || current === null) return false
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown }
    if (candidate.code === "23505") {
      return constraint ? candidate.constraint === constraint : true
    }
    current = "cause" in candidate ? candidate.cause : undefined
  }
  return false
}
