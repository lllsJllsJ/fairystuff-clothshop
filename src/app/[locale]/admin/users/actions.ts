"use server"

import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { authTokens, users } from "@/db/schema"
import { countOtherOwners, getUserForAdmin } from "@/db/queries/users"
import { sendTokenEmail } from "@/lib/account-email"
import { getCurrentUser } from "@/lib/auth-helpers"
import { emailEnabled } from "@/lib/email"
import { isOwner } from "@/lib/roles"
import { isUniqueViolation } from "@/lib/db-errors"
import { normalizedPhoneSchema } from "@/lib/validations/checkout"

import { revalidateUsers } from "./revalidate"

/**
 * Owner-only account administration. Same 5-step shape as every other
 * action file here: auth -> role check -> zod parse -> write -> revalidate.
 *
 * ---------------------------------------------------------------------
 * SECURITY — plan Risk 1, restated at every call site on purpose
 * ---------------------------------------------------------------------
 * No RLS. Every action below re-checks `isOwner(user.role)` independently,
 * even though the proxy and `requireOwner()` already gate the page that
 * calls it. This file is the most privilege-sensitive surface in the app —
 * `setUserRole` can MINT AN OWNER, so a missing check here is not just a
 * data leak, it is a full takeover with no backstop.
 *
 * ---------------------------------------------------------------------
 * LOCKOUT RAILS — why these actions refuse things the owner asked for
 * ---------------------------------------------------------------------
 * Two guards exist on both `setUserRole` and `deleteUser`, and neither is
 * cosmetic UI politeness — the UI hides these buttons, but a direct action
 * invocation must fail too:
 *
 *   1. SELF. You cannot demote or delete your own account. Doing so would
 *      revoke your own session's access mid-request; the very next
 *      navigation would bounce off `requireOwner()` to `/`.
 *   2. LAST OWNER. You cannot demote or delete the final owner even if it
 *      isn't you. Recovery from that state means re-running
 *      `npm run create-owner` against the PRODUCTION database — there is no
 *      in-app path back, since there is no public registration at all
 *      (guest checkout needs no account; see CLAUDE.md) and `setUserRole`
 *      below is the only in-app way to mint an owner.
 *
 * Guard 2 subsumes guard 1 when you are the only owner, but both are kept:
 * they fail for different reasons and the UI shows different messages.
 */

export type UserActionResult = { ok: true } | { ok: false; error: string }

/** Matches scripts/create-owner.ts so both paths cost the same to verify. */
const BCRYPT_SALT_ROUNDS = 12

const idSchema = z.uuid()
const roleSchema = z.enum(["owner", "staff"])
const localeSchema = z.enum(["th", "en"])

/**
 * The gate every action here opens with. Returns the acting user on
 * success, or the failure result to return verbatim.
 */
async function requireOwnerActor() {
  const user = await getCurrentUser()
  if (!user) return { denied: { ok: false as const, error: "unauthorized" } }
  if (!isOwner(user.role)) return { denied: { ok: false as const, error: "forbidden" } }
  return { actor: user }
}

/**
 * Promotes or demotes an account. `owner` is grantable here — this is the
 * only place in the app that can create a second owner without shell access
 * to the server, which is exactly why the checks above are not optional.
 */
export async function setUserRole(id: string, role: string): Promise<UserActionResult> {
  const gate = await requireOwnerActor()
  if (gate.denied) return gate.denied

  const parsedId = idSchema.safeParse(id)
  const parsedRole = roleSchema.safeParse(role)
  if (!parsedId.success || !parsedRole.success) return { ok: false, error: "invalid" }

  if (parsedId.data === gate.actor.id) return { ok: false, error: "self_role_change" }

  const target = await getUserForAdmin(parsedId.data)
  if (!target) return { ok: false, error: "not_found" }
  if (target.role === parsedRole.data) return { ok: true }

  // Demoting an owner: refuse if no other owner would remain.
  if (target.role === "owner" && parsedRole.data !== "owner") {
    if ((await countOtherOwners(target.id)) === 0) return { ok: false, error: "last_owner" }
  }

  try {
    await db.update(users).set({ role: parsedRole.data }).where(eq(users.id, target.id))
  } catch (error) {
    console.error("setUserRole failed", error)
    return { ok: false, error: "update_failed" }
  }

  revalidateUsers()
  return { ok: true }
}

/**
 * Hard-deletes an owner/staff account. There is no customer-order linkage to
 * worry about anymore — guest checkout stores no account reference at all
 * (see CLAUDE.md's guest-checkout invariant); `orders.createdBy` (an
 * admin-created order's author) is `ON DELETE SET NULL`, so deleting an
 * account never touches order history either way. `auth_tokens` rows
 * cascade on the FK; they are deleted explicitly first anyway so a pending
 * reset link is dead the moment the account is.
 */
export async function deleteUser(id: string): Promise<UserActionResult> {
  const gate = await requireOwnerActor()
  if (gate.denied) return gate.denied

  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: "invalid" }
  if (parsedId.data === gate.actor.id) return { ok: false, error: "self_delete" }

  const target = await getUserForAdmin(parsedId.data)
  if (!target) return { ok: false, error: "not_found" }

  if (target.role === "owner" && (await countOtherOwners(target.id)) === 0) {
    return { ok: false, error: "last_owner" }
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(authTokens).where(eq(authTokens.userId, target.id))
      await tx.delete(users).where(eq(users.id, target.id))
    })
  } catch (error) {
    console.error("deleteUser failed", error)
    return { ok: false, error: "delete_failed" }
  }

  revalidateUsers()
  return { ok: true }
}

/**
 * Marks an account's email verified by hand, without a round trip through an
 * emailed link.
 *
 * COSMETIC as of the guest-checkout migration: `authorize()` in src/auth.ts
 * no longer gates sign-in on `emailVerifiedAt` at all — that gate only ever
 * existed for the now-removed `customer` role, which could self-register
 * without proving an email. An owner/staff account can sign in whether or
 * not this is set. This action is kept only because it still has a real
 * effect (dropping any outstanding verify token) and because removing it
 * would be more churn than value; do NOT read its continued existence as
 * evidence that a login gate on this column still exists — it does not, and
 * re-adding one without checking `src/auth.ts` first risks locking out a
 * staff account that never verified an email.
 */
export async function verifyUserEmail(id: string): Promise<UserActionResult> {
  const gate = await requireOwnerActor()
  if (gate.denied) return gate.denied

  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: "invalid" }

  const target = await getUserForAdmin(parsedId.data)
  if (!target) return { ok: false, error: "not_found" }
  if (target.emailVerifiedAt) return { ok: true }

  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, target.id))
      await tx.delete(authTokens).where(eq(authTokens.userId, target.id))
    })
  } catch (error) {
    console.error("verifyUserEmail failed", error)
    return { ok: false, error: "update_failed" }
  }

  revalidateUsers()
  return { ok: true }
}

/**
 * Mails the account a password-reset link, reusing the same
 * `sendTokenEmail` pipeline `/forgot-password` uses, so lifetime, single-use
 * semantics, and the one-per-minute cooldown are identical rather than a
 * second implementation that can drift.
 *
 * The owner never sees or sets the new password — this issues the same link
 * the account holder would have requested themselves from
 * `/forgot-password`. Requires EMAIL_ENABLED; without it there is no
 * delivery channel and the action says so instead of silently doing
 * nothing.
 */
export async function sendUserPasswordReset(
  id: string,
  locale: string
): Promise<UserActionResult> {
  const gate = await requireOwnerActor()
  if (gate.denied) return gate.denied

  if (!emailEnabled()) return { ok: false, error: "email_disabled" }

  const parsedId = idSchema.safeParse(id)
  const parsedLocale = localeSchema.safeParse(locale)
  if (!parsedId.success || !parsedLocale.success) return { ok: false, error: "invalid" }

  const target = await getUserForAdmin(parsedId.data)
  if (!target) return { ok: false, error: "not_found" }
  // Email is still optional for owner/staff accounts, so there may be no
  // address to send to. Say so plainly — a silent success would leave the
  // owner believing a link went out.
  if (!target.email) return { ok: false, error: "no_email" }

  try {
    const sent = await sendTokenEmail({ id: target.id, email: target.email }, parsedLocale.data, "reset")
    if (!sent.ok) return { ok: false, error: sent.error }
  } catch (error) {
    console.error("sendUserPasswordReset failed", error)
    return { ok: false, error: "email_failed" }
  }

  return { ok: true }
}

/**
 * Creates a staff or owner account directly from `/admin/users`.
 *
 * This is the ONLY in-app path that mints an account from nothing — there
 * is no public registration (guest checkout needs no account; see
 * CLAUDE.md), so before this existed a second admin could only be made by
 * running `npm run create-owner` with shell access to the server. Like
 * `setUserRole`, it can grant `owner`, so the `requireOwnerActor()` gate
 * above it is load-bearing with no RLS backstop behind it.
 *
 * `emailVerifiedAt` is set at creation: the owner typing a colleague's
 * address in the admin IS the verification step, and leaving it null would
 * be a trap — nothing in the app can send this account a verification link
 * it could act on.
 */
const createUserSchema = z
  .object({
    fullname: z.string().trim().min(1, "required").max(120),
    // Both identifiers are optional individually (see the refine below),
    // but an empty string must become `undefined` -> SQL NULL, never "":
    // `users.email`/`users.phone` are UNIQUE, and Postgres allows many
    // NULLs but only one "".
    email: z
      .union([z.literal(""), z.email()])
      .optional()
      .transform((v) => (v ? v.trim().toLowerCase() : undefined)),
    // Reuses the same normalizer the storefront checkout uses, so a number
    // typed here and one captured at checkout compare equal.
    phone: z
      .union([z.literal(""), normalizedPhoneSchema])
      .optional()
      .transform((v) => (v ? v : undefined)),
    password: z.string().min(8, "min").max(72, "max"),
    role: roleSchema,
  })
  // At least one identifier, or the account can never sign in: `authorize`
  // in src/auth.ts looks the user up by email OR phone and by nothing else.
  .refine((v) => Boolean(v.email) || Boolean(v.phone), {
    error: "identifier_required",
    path: ["email"],
  })

export type CreateUserInput = z.input<typeof createUserSchema>

export async function createUser(values: CreateUserInput): Promise<UserActionResult> {
  const gate = await requireOwnerActor()
  if (gate.denied) return gate.denied

  const parsed = createUserSchema.safeParse(values)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message === "identifier_required" ? "identifier_required" : "invalid" }
  }
  const v = parsed.data

  const passwordHash = await bcrypt.hash(v.password, BCRYPT_SALT_ROUNDS)

  try {
    await db.insert(users).values({
      fullname: v.fullname,
      // Store SQL NULL, never "" — `users.email`/`users.phone` are UNIQUE and
      // Postgres permits many NULLs but only one empty string.
      email: v.email ?? null,
      phone: v.phone ?? null,
      passwordHash,
      role: v.role,
      emailVerifiedAt: new Date(),
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" }
    console.error("createUser failed", error)
    return { ok: false, error: "failed" }
  }

  revalidateUsers()
  return { ok: true }
}
