import { getTranslations } from "next-intl/server"
import { emailEnabled } from "@/lib/email"
import { AuthShell } from "@/components/auth/auth-shell"
import { ForgotPasswordForm } from "@/components/auth/account-forms"

export const dynamic = "force-dynamic"

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth")
  return <AuthShell title={t("forgotPassword")}><ForgotPasswordForm enabled={emailEnabled()} /></AuthShell>
}
