import { NextResponse } from "next/server"
import createMiddleware from "next-intl/middleware"

import { auth } from "@/auth"
import { routing } from "@/i18n/routing"

/**
 * Next.js 16 renamed Middleware to Proxy (file convention `src/proxy.ts`,
 * named export `proxy` or a default export — NOT `middleware.ts`; see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * proxy.md`). Functionally identical to the old Middleware: `NextProxy` is
 * a type alias for `NextMiddleware` (`node_modules/next/dist/server/web/
 * types.d.ts`).
 *
 * Auth.js v5's `auth()` wrapper, when called with a callback, returns
 * exactly a `NextMiddleware`-shaped function (see next-auth's
 * `NextAuthResult.auth` overload `(...args: [NextAuthMiddleware]) =>
 * NextMiddleware` in `node_modules/next-auth/lib/index.d.ts`). Since
 * `NextProxy = NextMiddleware`, `auth(callback)` is ALREADY the shape Next
 * 16's proxy file convention expects — no adapter needed beyond naming the
 * export `proxy` instead of `middleware` (plan Risk 5, resolved).
 *
 * ----------------------------------------------------------------------
 * COMPOSING next-intl WITH Auth.js (routing migration: cookie -> URL
 * segment locale)
 * ----------------------------------------------------------------------
 * Two middlewares now have to run on the same request, in a fixed order:
 * next-intl resolves/redirects the locale FIRST, and only once the request
 * carries a real `/th` or `/en` segment does the auth guard evaluate it —
 * checking an unprefixed path against locale-prefixed protected prefixes
 * would silently never match. `createMiddleware(routing)` is called from
 * INSIDE the `auth((req) => {...})` callback (not the other way around) so
 * the callback still receives the Auth.js-augmented `req.auth`.
 *
 * next-intl only applies to PAGE paths — `/api/**` routes live outside the
 * `[locale]` segment entirely (see src/app/ structure) and are never
 * locale-prefixed, so they're guarded directly, before next-intl ever
 * touches them.
 *
 * ----------------------------------------------------------------------
 * THE INVERTED GUARD (plan §6, departure from carstockpro)
 * ----------------------------------------------------------------------
 * carstockpro uses a `PUBLIC_PATHS` ALLOWLIST — everything not explicitly
 * public redirects to /login. This shop is public-by-default (the
 * storefront IS the product), so the guard is inverted to a PROTECTED
 * PREFIX DENYLIST: only /admin, /api/admin, and /api/uploads require a
 * session; everything else passes through untouched. The prefixes below
 * are checked against the LOCALE-STRIPPED page path (`/admin`, not
 * `/th/admin`) for page requests, and against the raw path for `/api/**`
 * requests (which never carry a locale segment).
 */
const PROTECTED_PREFIXES = ["/admin", "/api/admin", "/api/uploads"]

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function isRedirect(response: NextResponse): boolean {
  return response.status >= 300 && response.status < 400
}

const handleI18nRouting = createMiddleware(routing)

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl

  // `/api/**` is never locale-prefixed (it lives outside src/app/[locale]),
  // so next-intl has nothing to negotiate here — guard it directly.
  if (pathname.startsWith("/api/")) {
    if (!req.auth && isProtected(pathname)) {
      // API routes must FAIL, not redirect. A 307 to /login is useless to a
      // fetch/curl caller (which either follows it and gets an HTML login
      // page with a 200, or reports a redirect) and it breaks plan §13
      // check 4, which asserts anonymous callers see 401. Only browser page
      // requests get the redirect, below.
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Pages: let next-intl resolve/redirect the locale FIRST. If the
  // incoming path has no (or an unrecognized) locale prefix, `localePrefix:
  // "always"` means this issues its OWN redirect to the prefixed URL (e.g.
  // "/admin" -> "/th/admin", "/" -> "/th") and returns immediately — the
  // browser's follow-up request already carries the locale segment, and
  // the auth check below runs cleanly against that request. Only once a
  // path already carries a valid locale segment do we know it's safe to
  // read that segment out and build locale-correct redirect targets
  // ourselves.
  const intlResponse = handleI18nRouting(req)
  if (isRedirect(intlResponse)) {
    return intlResponse
  }

  const [, locale, ...rest] = pathname.split("/")
  const bare = rest.length > 0 ? `/${rest.join("/")}` : "/"

  if (!req.auth && isProtected(bare)) {
    const url = req.nextUrl.clone()
    url.pathname = `/${locale}/login`
    url.search = ""
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  if (req.auth && bare === "/login") {
    const url = req.nextUrl.clone()
    url.pathname = `/${locale}/admin`
    url.search = ""
    return NextResponse.redirect(url)
  }

  return intlResponse
})

/**
 * WIDER matcher than before this migration — and that's fine. next-intl
 * needs to see every page request to negotiate/redirect the locale, so the
 * matcher necessarily covers effectively all pages now, not just the three
 * protected prefixes.
 *
 * This does NOT reintroduce the dynamic-rendering problem the migration
 * fixes. Proxy/middleware running on a request is unrelated to whether the
 * PAGE it resolves to is statically generated — middleware always runs at
 * the edge/request layer regardless of a route's rendering mode. What
 * forces a route to `ƒ` dynamic is a `cookies()`/`headers()` call INSIDE
 * render (the old `src/i18n/request.ts` calling `cookies()`, now removed —
 * see that file and `src/app/[locale]/layout.tsx`'s `setRequestLocale()`).
 * A wide proxy matcher and a statically-generated page underneath it are
 * fully compatible; do not "fix" this comment by narrowing the matcher
 * back down, and do not read the old narrow-matcher comment from before
 * this migration as still applying — it described a real constraint under
 * the cookie-based setup that no longer exists.
 *
 * Excludes: Next internals (`_next`), any path with a file extension
 * (static assets — favicon.ico, images, etc.), and `/api/**` is handled by
 * its own dedicated matcher entries below since it's never locale-prefixed
 * and must still be guarded even though it's excluded from the general
 * (page) pattern.
 */
export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
    "/api/admin/:path*",
    "/api/uploads/:path*",
  ],
}
