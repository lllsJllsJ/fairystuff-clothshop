"use server"

import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { authTokens, users } from "@/db/schema"
import { sendTokenEmail } from "@/lib/account-email"
import { findValidAuthToken } from "@/lib/auth-tokens"
import { emailEnabled } from "@/lib/email"
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth"

const localeSchema = z.enum(["th", "en"])

export type AccountActionResult = { ok: true; emailEnabled?: boolean } | { ok: false; error: string }

/**
 * Owner/staff-only password recovery. There is no public registration and no
 * email-verification flow anymore (guest checkout needs no account at all —
 * see CLAUDE.md) — `registerCustomer`, `resendVerification`, and
 * `verifyEmailToken` were removed along with the `customer` role and the
 * `account/`/`register/`/`verify-email`/`resend-verification` routes that
 * called them. `requestPasswordReset` and `resetPassword` remain: an owner
 * or staff account can still recover a forgotten password by email.
 */
export async function requestPasswordReset(email: string, locale: string): Promise<AccountActionResult> {
  if (!emailEnabled()) return { ok: false, error: "disabled" }
  if (!localeSchema.safeParse(locale).success) return { ok: false, error: "invalid" }
  const parsed = z.email().safeParse(email.trim().toLowerCase())
  if (!parsed.success) return { ok: true }
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, parsed.data))
    .limit(1)
  if (user?.email) {
    try {
      await sendTokenEmail({ id: user.id, email: user.email }, locale, "reset")
    } catch (error) {
      console.error("password reset email failed", error)
    }
  }
  return { ok: true }
}

export async function resetPassword(values: ResetPasswordInput): Promise<AccountActionResult> {
  if (!emailEnabled()) return { ok: false, error: "disabled" }
  const parsed = resetPasswordSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const row = await findValidAuthToken(parsed.data.token, "reset_password")
  if (!row) return { ok: false, error: "invalid_token" }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId))
    await tx.delete(authTokens).where(eq(authTokens.userId, row.userId))
  })
  return { ok: true }
}
