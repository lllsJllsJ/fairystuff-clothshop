"use server"

import bcrypt from "bcryptjs"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { authTokens, users } from "@/db/schema"
import { findValidAuthToken, issueAuthToken } from "@/lib/auth-tokens"
import { emailEnabled, sendAccountEmail } from "@/lib/email"
import { resetPasswordSchema, signupSchema, type ResetPasswordInput, type SignupInput } from "@/lib/validations/auth"

const VERIFY_LIFETIME = 24 * 60 * 60 * 1000
const RESET_LIFETIME = 60 * 60 * 1000
const localeSchema = z.enum(["th", "en"])

export type AccountActionResult = { ok: true; emailEnabled?: boolean } | { ok: false; error: string }

function origin() {
  const value = process.env.AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (!value) throw new Error("site_url_not_configured")
  return value.replace(/\/+$/, "")
}

function copy(locale: string, kind: "verify" | "reset") {
  const th = locale === "th"
  if (kind === "verify") return th
    ? { subject: "ยืนยันอีเมล", heading: "ยืนยันอีเมลของคุณ", body: "กดปุ่มด้านล่างเพื่อเปิดใช้งานบัญชีร้านค้า", action: "ยืนยันอีเมล" }
    : { subject: "Verify your email", heading: "Verify your email", body: "Use the button below to activate your shop account.", action: "Verify email" }
  return th
    ? { subject: "ตั้งรหัสผ่านใหม่", heading: "ตั้งรหัสผ่านใหม่", body: "กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์นี้ใช้ได้หนึ่งชั่วโมง", action: "ตั้งรหัสผ่านใหม่" }
    : { subject: "Reset your password", heading: "Reset your password", body: "Use the button below to set a new password. This link expires in one hour.", action: "Reset password" }
}

async function sendTokenEmail(user: { id: string; email: string }, locale: string, kind: "verify" | "reset") {
  const issued = await issueAuthToken(
    user.id,
    kind === "verify" ? "verify_email" : "reset_password",
    kind === "verify" ? VERIFY_LIFETIME : RESET_LIFETIME
  )
  if (!issued.ok) return issued
  const text = copy(locale, kind)
  const path = kind === "verify" ? "verify-email" : "reset-password"
  const actionUrl = `${origin()}/${locale}/${path}?token=${encodeURIComponent(issued.token)}`
  await sendAccountEmail({
    to: user.email,
    subject: text.subject,
    heading: text.heading,
    body: text.body,
    actionLabel: text.action,
    actionUrl,
  })
  return { ok: true as const }
}

export async function registerCustomer(values: SignupInput, locale: string): Promise<AccountActionResult> {
  const parsed = signupSchema.safeParse(values)
  if (!parsed.success || !["th", "en"].includes(locale)) return { ok: false, error: "invalid" }
  const v = parsed.data
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, v.email)).limit(1)
  if (existing) return { ok: true, emailEnabled: emailEnabled() }

  const passwordHash = await bcrypt.hash(v.password, 12)
  const [user] = await db.insert(users).values({
    email: v.email,
    passwordHash,
    fullname: v.fullname,
    role: "customer",
    emailVerifiedAt: emailEnabled() ? null : new Date(),
  }).onConflictDoNothing({ target: users.email }).returning({ id: users.id, email: users.email })
  // A concurrent registration may win after the lookup above. Preserve the
  // same generic success response so email existence is never disclosed.
  if (!user) return { ok: true, emailEnabled: emailEnabled() }

  if (emailEnabled()) {
    try {
      await sendTokenEmail(user, locale, "verify")
    } catch (error) {
      console.error("verification email failed", error)
      return { ok: false, error: "email_failed" }
    }
  }
  return { ok: true, emailEnabled: emailEnabled() }
}

export async function resendVerification(email: string, locale: string): Promise<AccountActionResult> {
  if (!emailEnabled()) return { ok: false, error: "disabled" }
  if (!localeSchema.safeParse(locale).success) return { ok: false, error: "invalid" }
  const parsed = z.email().safeParse(email.trim().toLowerCase())
  if (!parsed.success) return { ok: true }
  const [user] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, parsed.data))
    .limit(1)
  if (!user || user.emailVerifiedAt) return { ok: true }
  try {
    await sendTokenEmail(user, locale, "verify")
  } catch (error) {
    console.error("resend verification failed", error)
  }
  return { ok: true }
}

export async function verifyEmailToken(token: string): Promise<AccountActionResult> {
  const row = await findValidAuthToken(token, "verify_email")
  if (!row) return { ok: false, error: "invalid_token" }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId))
    await tx.delete(authTokens).where(and(eq(authTokens.userId, row.userId), eq(authTokens.type, "verify_email")))
  })
  return { ok: true }
}

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
  if (user) {
    try {
      await sendTokenEmail(user, locale, "reset")
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
