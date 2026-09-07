import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { eq, or } from "drizzle-orm"

import { db } from "@/db"
import { users } from "@/db/schema"
import { loginSchema } from "@/lib/validations/auth"

/**
 * ============================================================================
 * SECURITY MODEL — READ THIS FIRST (plan Risk 1)
 * ============================================================================
 * There is no RLS in this stack — the database has no public API, so every
 * query runs through our own server code over a private connection string.
 * That means THIS FILE, `requireOwner()` in src/lib/auth-helpers.ts, and the
 * proxy guard in src/proxy.ts are the ENTIRE server-side security boundary.
 * Under Supabase (carstockpro), a forgotten role check still hit an RLS
 * wall; here a missing `if (!isOwner(user.role))` in a server action is a
 * full breach with no backstop. Every future server action MUST re-check
 * `isOwner(user.role)` independently — never assume the proxy or the admin
 * layout already covered it, since a matcher change or a moved route can
 * silently drop proxy coverage (see src/proxy.ts's comment).
 * ============================================================================
 *
 * Credentials provider only, JWT session strategy (no database adapter —
 * one owner account doesn't need a `sessions` table, and JWT keeps this
 * config readable by Next 16's proxy, which decodes the session cookie
 * without touching the database — see src/proxy.ts).
 *
 * There is NO public registration. Accounts are owner/staff only — guest
 * checkout needs no sign-in at all (see CLAUDE.md and the removed
 * `account/`/`register/` trees). The only way an `owner` row is created is
 * `scripts/create-owner.ts`; an owner can promote an existing `staff`
 * account from `/admin/users`.
 */

/**
 * A real bcrypt hash (cost 10) of a random string that is not any account's
 * password. Compared against when the email doesn't exist, purely so the
 * failure path costs the same wall-clock time as a wrong-password failure.
 * Never treat a match here as authentication.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$10$nzJs8gSXas8NdYBwoXDseeh3Ro.GR8Q0Ekju7rdrC5iidWGqjYSzm"

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Payload from the client is untrusted — validate before any query.
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { identifier, password } = parsed.data

        const [user] = await db
          .select()
          .from(users)
          .where(or(eq(users.email, identifier), eq(users.phone, identifier)))
          .limit(1)

        // Never reveal whether the identifier exists. Returning early on a missing
        // row would leak it through TIMING: bcrypt.compare costs ~100ms, so a
        // fast rejection means "no such account" and a slow one means "wrong
        // password" — enough to enumerate valid accounts. Always spend the same
        // work by comparing against a dummy hash of the same cost factor.
        const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH
        const valid = await bcrypt.compare(password, hash)
        if (!user || !valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.fullname ?? undefined,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // `user` is only present on the initial sign-in call; carry its id
      // and role onto the token so subsequent requests don't need a query.
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      // `LoginForm` calls `useSession().update()` right after a successful
      // sign-in so the persistent header reflects the new session
      // immediately, without waiting for a full page reload. Refresh from
      // the database rather than trusting anything the client could supply.
      if (trigger === "update" && token.id) {
        const [freshUser] = await db
          .select({
            email: users.email,
            fullname: users.fullname,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, token.id))
          .limit(1)
        if (freshUser) {
          token.email = freshUser.email
          token.name = freshUser.fullname
          token.role = freshUser.role
        }
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.name = token.name
      session.user.email = token.email ?? ""
      return session
    },
  },
})
