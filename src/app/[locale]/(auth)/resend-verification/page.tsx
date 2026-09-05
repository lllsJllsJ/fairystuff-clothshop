import { getTranslations } from "next-intl/server"

import { emailEnabled } from "@/lib/email"
import { AuthShell } from "@/components/auth/auth-shell"
import { ResendVerificationForm } from "@/components/auth/account-forms"

export const dynamic = "force-dynamic"

export default async function ResendVerificationPage() {
  const t = await getTranslations("auth")
  return <AuthShell title={t("resendVerification")}><ResendVerificationForm enabled={emailEnabled()} /></AuthShell>
}
