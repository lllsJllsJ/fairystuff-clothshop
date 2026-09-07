/**
 * Pure role predicates — CLIENT-SAFE. No `next/headers`, no `server-only`,
 * no database import. This file must be importable from a "use client"
 * component without pulling server code into the browser bundle (see
 * src/lib/auth-helpers.ts, which is the server-only counterpart).
 *
 * `owner` runs the shop, `staff` is the fail-safe default with no capability
 * in v1. There is no `customer` role — guest checkout needs no account at
 * all (see CLAUDE.md's security model and the removed `account/` tree).
 */

export type UserRole = "owner" | "staff"

export function isOwner(role: UserRole | null | undefined): boolean {
  return role === "owner"
}

export function isStaff(role: UserRole | null | undefined): boolean {
  return role === "staff"
}
