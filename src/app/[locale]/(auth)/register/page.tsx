import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth/auth-shell"
import { RegisterForm } from "@/components/auth/account-forms"

export default async function RegisterPage() {
  const t = await getTranslations("auth")
  return <AuthShell title={t("createAccount")}><RegisterForm /></AuthShell>
}
