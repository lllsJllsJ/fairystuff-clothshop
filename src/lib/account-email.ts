import "server-only"

import { issueAuthToken } from "@/lib/auth-tokens"
import { sendAccountEmail } from "@/lib/email"

/**
 * Verification / password-reset link issuing, shared by the two callers that
 * need it: the customer-facing account actions
 * (`src/app/[locale]/(auth)/account-actions.ts`) and the owner-facing user
 * admin (`src/app/[locale]/admin/users/actions.ts`).
 *
 * This lives outside both because a `"use server"` module may only export
 * async *actions* — a helper exported from one of them would become a
 * remotely-callable endpoint. Keeping it here means the admin path reuses
 * the exact same token lifetimes, cooldown, and localized copy the customer
 * path uses, rather than growing a second, drifting implementation.
 */

export const VERIFY_LIFETIME = 24 * 60 * 60 * 1000
export const RESET_LIFETIME = 60 * 60 * 1000

export type TokenEmailKind = "verify" | "reset"

/** Absolute origin for the emailed link. Throws rather than sending a
 * relative URL that would be dead in a mail client. */
export function origin() {
  const value = process.env.AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (!value) throw new Error("site_url_not_configured")
  return value.replace(/\/+$/, "")
}

export function copy(locale: string, kind: TokenEmailKind) {
  const th = locale === "th"
  if (kind === "verify") return th
    ? { subject: "ยืนยันอีเมล", heading: "ยืนยันอีเมลของคุณ", body: "กดปุ่มด้านล่างเพื่อเปิดใช้งานบัญชีร้านค้า", action: "ยืนยันอีเมล" }
    : { subject: "Verify your email", heading: "Verify your email", body: "Use the button below to activate your shop account.", action: "Verify email" }
  return th
    ? { subject: "ตั้งรหัสผ่านใหม่", heading: "ตั้งรหัสผ่านใหม่", body: "กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์นี้ใช้ได้หนึ่งชั่วโมง", action: "ตั้งรหัสผ่านใหม่" }
    : { subject: "Reset your password", heading: "Reset your password", body: "Use the button below to set a new password. This link expires in one hour.", action: "Reset password" }
}

/**
 * Issues a single-use token and mails the matching link. Returns the
 * `issueAuthToken` failure verbatim (currently `cooldown`) so the caller can
 * distinguish "asked again too soon" from a send failure, which throws.
 */
export async function sendTokenEmail(
  user: { id: string; email: string },
  locale: string,
  kind: TokenEmailKind
) {
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
