"use server"

import { getLocale } from "next-intl/server"

import { signOut } from "@/auth"

/**
 * Bound directly to a <form action={signOutAction}> in UserMenu — Auth.js's
 * documented pattern for a sign-out button (see the `signOut` JSDoc in
 * next-auth's NextAuthResult type). Lands on the locale-correct home
 * (`/th`, `/en`, ...) per the plan §11 Phase 2 acceptance criteria — a bare
 * `redirectTo: "/"` would still work (next-intl's proxy would redirect it
 * to the default locale on the follow-up request) but costs an extra hop;
 * this is always invoked from an already-rendered admin page, so the
 * current locale is available via `getLocale()` without any dynamic read.
 */
export async function signOutAction() {
  const locale = await getLocale()
  await signOut({ redirectTo: `/${locale}` })
}
