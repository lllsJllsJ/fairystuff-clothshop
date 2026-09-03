import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { requireOwner } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";

/**
 * Layer two of the three-layer guard (plan §6, Risk 1): the proxy already
 * redirected unauthenticated/non-owner requests before this ever renders,
 * but `requireOwner()` is repeated here as a hard backstop — it must not
 * be trusted to have already run. Server actions under admin/* repeat the
 * check a third time; see the security note at the top of src/auth.ts.
 *
 * Admin routes require a session, so they stay `ƒ` dynamic regardless —
 * that's expected and correct (see the acceptance note in src/proxy.ts).
 * `setRequestLocale()` is still called here (before `requireOwner()`) so
 * every translation and the locale-aware redirect inside it resolve from
 * next-intl's request cache rather than a fresh `headers()` read.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireOwner();

  // The [locale] layout deliberately ships only public namespaces to the
  // client (see its comment). Admin client components need the admin
  // namespaces too, so re-provide the full bundle for this subtree only.
  const messages = await getMessages();

  return (
    // Scoped `.admin` hook (plan §8 closing note) — no rules are attached
    // yet since DESIGN.md's Sanrio system already applies uniformly (0px
    // radius everywhere, single fuchsia accent). Reserved for admin-only
    // surface treatment if the storefront (Phase 4) ever needs to diverge
    // from the admin's utilitarian density.
    <NextIntlClientProvider messages={messages}>
      <div className="admin flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={user} />
          <main className="flex-1 px-4 py-5 pb-24 md:px-6 md:pb-8">
            {children}
          </main>
          <BottomNav />
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
