"use server"

import { AuthError } from "next-auth"
import { eq } from "drizzle-orm"

import { signIn } from "@/auth"
import { db } from "@/db"
import { users } from "@/db/schema"
import { loginSchema } from "@/lib/validations/auth"
import type { UserRole } from "@/lib/roles"

export type LoginResult = { ok: true; role: UserRole } | { ok: false; error: "invalid" }

/**
 * Signs in with the Credentials provider. Every failure — malformed input,
 * unknown email, wrong password — maps to the SAME `invalid` result. Never
 * reveal which part was wrong; that is what makes this safe against
 * enumerating registered emails (mirrors carstockpro's
 * `loginWithIdentifier`, which preserves the same property).
 *
 * `redirect: false` because the caller (the client login form) needs the
 * ok/error result to decide what to render; it does its own
 * `router.push(redirectTo)` on success.
 */
export async function login(values: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    })
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.email, parsed.data.email.trim().toLowerCase())).limit(1)
    if (!user) return { ok: false, error: "invalid" }
    return { ok: true, role: user.role }
  } catch (error) {
    // next-auth's server-side signIn() re-throws AuthError (e.g. the
    // CredentialsSignin subclass thrown when `authorize` returns null) to
    // the caller when `raw` mode is used internally — see
    // node_modules/next-auth/lib/actions.js. Anything else is unexpected
    // and should surface as a real error, not a silent "invalid".
    if (error instanceof AuthError) {
      return { ok: false, error: "invalid" }
    }
    throw error
  }
}
