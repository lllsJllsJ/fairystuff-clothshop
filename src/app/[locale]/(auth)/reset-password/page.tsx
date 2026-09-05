import { getTranslations } from "next-intl/server"
import { emailEnabled } from "@/lib/email"
import { AuthShell } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/account-forms"

export const dynamic = "force-dynamic"

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTranslations("auth")
  const { token = "" } = await searchParams
  return <AuthShell title={t("resetPassword")}><ResetPasswordForm token={token} enabled={emailEnabled()} /></AuthShell>
}
