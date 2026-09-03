import type { DefaultSession } from "next-auth"

import type { UserRole } from "@/lib/roles"

/**
 * Module augmentation so `session.user.role` / the JWT payload's `role` are
 * typed everywhere Auth.js types are used (auth(), the jwt/session
 * callbacks, getCurrentUser()). See src/auth.ts for where these fields are
 * actually populated.
 */
declare module "next-auth" {
  interface User {
    id: string
    role: UserRole
  }

  interface Session {
    user: {
      id: string
      role: UserRole
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: UserRole
  }
}

// next-auth/jwt.d.ts only re-exports @auth/core/jwt's JWT interface rather
// than declaring it; TypeScript's declaration merging targets the module
// where an interface is originally authored, not modules that re-export
// it. next-auth's own NextAuthConfig callbacks (jwt/session) are typed
// against @auth/core's JWT directly, so this augmentation is needed too —
// without it, `token.id` / `token.role` read back as `unknown` inside
// src/auth.ts's callbacks even though the "next-auth/jwt" augmentation
// above looks like it should have covered it.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string
    role: UserRole
  }
}
