import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "clothshop",
  description: "เสื้อผ้าแฟชั่นสำหรับคุณ • A personal clothing label",
};

/**
 * Namespaces the public storefront actually renders. Anything not listed
 * here is admin-only and is withheld from the public client bundle. When
 * you add a namespace to src/messages/*.json, decide which side it belongs
 * to — omitting it here silently breaks a public string.
 */
const PUBLIC_NAMESPACES = new Set([
  "app",
  "common",
  "nav",
  "auth",
  "home",
  "footer",
  "shop",
  "cart",
  "checkout",
  "account",
  "errors",
]);

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * The locale-specific half of the root layout split (see the long comment
 * in src/app/layout.tsx for why the split exists and what it protects).
 *
 * `setRequestLocale(locale)` is the load-bearing call here: it seeds
 * next-intl's request-scoped cache with `params.locale` — a value already
 * known at build time via `generateStaticParams` above, not read from a
 * per-request API — so every `getTranslations()` / `getLocale()` /
 * `<NextIntlClientProvider>` call in this subtree (including in every
 * nested page under this layout) resolves from that cache instead of
 * falling through to `headers()`. Skipping this call on any layout/page
 * that needs to render statically silently forces it back to `ƒ`.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  // Ship ONLY public namespaces to the client here. NextIntlClientProvider
  // serialises whatever it is given into the RSC payload of every page in
  // its subtree, so passing the whole bundle put the entire admin
  // vocabulary (product/order/dashboard/reports/import/settings — ~46% of
  // the bundle) into every customer-facing page. Not a data leak (they are
  // field LABELS, never values), but dead weight on the storefront's
  // critical path and it grows with every admin feature.
  //
  // src/app/[locale]/admin/layout.tsx re-provides the FULL bundle for the
  // admin subtree, so admin client components are unaffected.
  const messages = await getMessages();
  const publicMessages = Object.fromEntries(
    Object.entries(messages).filter(([ns]) => PUBLIC_NAMESPACES.has(ns)),
  );

  return (
    // This component — NOT the root layout — owns <html>, because `locale`
    // is known statically here (via generateStaticParams) while the root
    // layout sits above the [locale] segment and cannot see it without a
    // dynamic read. Rendering it here puts the correct `lang` into the
    // PRERENDERED bytes, which is what crawlers and screen readers read.
    // See the long comment in src/app/layout.tsx.
    <html lang={locale} className={`${fontVariables} h-full antialiased`}>
      <body className="bg-background text-foreground min-h-full">
        <NextIntlClientProvider messages={publicMessages}>
          <Providers>{children}</Providers>
          <Toaster position="top-center" richColors />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
