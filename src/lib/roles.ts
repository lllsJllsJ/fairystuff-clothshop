/**
 * Pure role predicates — CLIENT-SAFE. No `next/headers`, no `server-only`,
 * no database import. This file must be importable from a "use client"
 * component without pulling server code into the browser bundle (see
 * src/lib/auth-helpers.ts, which is the server-only counterpart).
 *
 * `owner` runs the shop, `staff` is the fail-safe default with no customer
 * capability, and `customer` owns storefront orders.
 */

export type UserRole = "owner" | "staff" | "customer"

export function isOwner(role: UserRole | null | undefined): boolean {
  return role === "owner"
}

export function isStaff(role: UserRole | null | undefined): boolean {
  return role === "staff"
}

export function isCustomer(role: UserRole | null | undefined): boolean {
  return role === "customer"
}
