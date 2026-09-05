import { getTranslations } from "next-intl/server"
import { verifyEmailToken } from "@/app/[locale]/(auth)/account-actions"
import { Link } from "@/i18n/navigation"
import { AuthShell } from "@/components/auth/auth-shell"

export const dynamic = "force-dynamic"

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTranslations("auth")
  const { token = "" } = await searchParams
  const result = token ? await verifyEmailToken(token) : { ok: false as const, error: "invalid_token" }
  return <AuthShell title={t("verifyEmail")}>
    <p className="text-body">{result.ok ? t("verified") : t("invalidVerification")}</p>
    {result.ok && <Link href="/login" className="mt-4 inline-block text-link hover:underline">{t("signIn")}</Link>}
  </AuthShell>
}
