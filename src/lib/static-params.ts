import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/db"
import { routing } from "@/i18n/routing"

/**
 * `generateStaticParams` for every storefront route under `[locale]/(shop)`.
 *
 * WHY THIS EXISTS: Railway's build container cannot reach the database —
 * `DATABASE_URL` points at the private `*.railway.internal` network, which
 * only exists at runtime. Every storefront page reads the database (the
 * `(shop)` layout reads shop settings for the brand/header/footer), and each
 * read falls back to an empty result during a build rather than failing it.
 * Prerendering the locales anyway baked those empty pages ("Your Label", no
 * products, no contacts) into the ISR cache, and production served them
 * until each page's first visit after `revalidate` (300s) — so every deploy
 * showed the first visitors a blank shop.
 *
 * So: during a production build, probe the database once. Reachable (local
 * builds, CI with a live DB) -> prerender both locales as before. Not
 * reachable -> return no params; with `dynamicParams` at its default `true`
 * each page then renders on its first real request, against the live
 * database, and is cached by ISR from there. Outside a build (dev, runtime
 * revalidation) the locales are always returned.
 */
export async function prerenderLocaleParams(): Promise<{ locale: string }[]> {
  if (process.env.NEXT_PHASE === "phase-production-build" && !(await databaseReachable())) {
    return []
  }
  return routing.locales.map((locale) => ({ locale }))
}

let probe: Promise<boolean> | undefined

/** One `select 1` per build worker, shared by every route that asks. */
function databaseReachable(): Promise<boolean> {
  probe ??= db
    .execute(sql`select 1`)
    .then(() => true)
    .catch((error: unknown) => {
      console.warn(
        "[static-params] database unreachable during build; storefront pages will render on first request",
        error instanceof Error ? error.message : error
      )
      return false
    })
  return probe
}
