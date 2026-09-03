import type { Viewport } from "next"

import "./globals.css"

export const viewport: Viewport = {
  themeColor: "#EF4C7F",
  width: "device-width",
  initialScale: 1,
}

/**
 * PASSTHROUGH root layout — deliberately renders no <html>/<body>.
 *
 * Next requires a root layout to exist, but this one sits ABOVE the
 * `[locale]` segment and so structurally never receives `params.locale`.
 * The only way it could learn the locale is a dynamic read
 * (`getLocale()`/`headers()`), which would force every page back to `ƒ`
 * dynamic rendering and undo the whole point of URL-segment locales.
 *
 * An earlier version resolved that by rendering `<html lang={DEFAULT_LOCALE}>`
 * here and correcting the attribute client-side with an inline script. That
 * was wrong: the PRERENDERED bytes for /en still said `lang="th"`, and
 * crawlers, `hreflang` consumers, and screen readers parsing the served
 * document never run that script. Since correct per-locale `lang` is a
 * principal reason for path-prefixed locales, the <html> element moved down
 * into src/app/[locale]/layout.tsx where `locale` is known statically.
 *
 * Consequence: every route that renders outside `[locale]` must supply its
 * own <html>/<body> — currently src/app/not-found.tsx and Next's
 * global-error boundary. Do not reintroduce <html> here.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
