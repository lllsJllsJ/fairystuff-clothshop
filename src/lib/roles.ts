/**
 * Pure role predicates — CLIENT-SAFE. No `next/headers`, no `server-only`,
 * no database import. This file must be importable from a "use client"
 * component without pulling server code into the browser bundle (see
 * src/lib/auth-helpers.ts, which is the server-only counterpart).
 *
 * Two-role enum only: `owner` runs the shop, `staff` is the fail-safe
 * default with zero capability in v1 (plan §1 row 2, §4).
 */

export type UserRole = "owner" | "staff"

export function isOwner(role: UserRole | null | undefined): boolean {
  return role === "owner"
}

export function isStaff(role: UserRole | null | undefined): boolean {
  return role === "staff"
}
