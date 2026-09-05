import { Suspense } from "react"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Shirt } from "lucide-react"

import { LoginForm } from "@/components/auth/login-form"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { emailEnabled } from "@/lib/email"

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations()

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="absolute top-4 right-4">
        <LocaleToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center bg-primary text-primary-foreground">
            <Shirt className="size-7" />
          </div>
          <h1 className="text-h3 font-bold text-foreground">{t("app.name")}</h1>
          <p className="mt-1 text-body text-muted-foreground">
            {t("auth.loginSubtitle")}
          </p>
        </div>

        <div className="border border-border bg-card p-6">
          <Suspense>
            <LoginForm emailEnabled={emailEnabled()} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
