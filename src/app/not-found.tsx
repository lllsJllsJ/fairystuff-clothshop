import { fontVariables } from "@/lib/fonts"
import { DEFAULT_LOCALE } from "@/i18n/request"

/**
 * Root-level 404 for paths that never resolved to a locale segment. Renders
 * its own <html>/<body> because the root layout is a passthrough — see the
 * comment in src/app/layout.tsx. Locale-scoped 404s (a bad product code, for
 * instance) are handled inside [locale] and get the real localized chrome.
 */
export default function NotFound() {
  return (
    <html lang={DEFAULT_LOCALE} className={`${fontVariables} h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full items-center justify-center p-6">
        <main className="text-center">
          <p className="text-muted-foreground text-body">404</p>
          <h1 className="text-h2 mt-2 font-bold">ไม่พบหน้านี้</h1>
          <p className="text-muted-foreground text-body mt-2">
            Page not found
          </p>
          <a
            href={`/${DEFAULT_LOCALE}`}
            className="bg-primary text-primary-foreground hover:bg-primary-hover mt-6 inline-block px-4 py-2.5 text-body transition-colors"
          >
            กลับหน้าแรก
          </a>
        </main>
      </body>
    </html>
  )
}
