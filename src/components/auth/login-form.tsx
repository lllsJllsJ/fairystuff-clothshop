"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSession } from "next-auth/react"
import { Loader2 } from "lucide-react"

import { login } from "@/app/[locale]/(auth)/login/actions"
import { loginSchema, type LoginInput } from "@/lib/validations/auth"
import { loginDestination } from "@/lib/login-redirect"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

/**
 * `redirect` (when present) already comes fully locale-prefixed from
 * src/proxy.ts's guard (`?redirect=/th/admin`), so it's pushed through the
 * PLAIN `next/navigation` router below, not the locale-aware one from
 * `@/i18n/navigation` — that helper always re-prefixes its `href` with the
 * current locale, which would double it (`/th/th/admin`). The fallback
 * builds the same shape by hand from the current locale.
 */
export function LoginForm({ emailEnabled }: { emailEnabled: boolean }) {
  const t = useTranslations("auth")
  const locale = useLocale()
  const router = useRouter()
  const params = useSearchParams()
  const requestedRedirect = params.get("redirect")
  const { update: updateSession } = useSession()

  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  })

  const submitting = form.formState.isSubmitting

  async function onSubmit(values: LoginInput) {
    setSubmitError(null)
    const result = await login(values)
    if (!result.ok) {
      // One generic message regardless of which part failed — never reveal
      // whether an email is registered (see actions.ts).
      setSubmitError(t("invalidCredentials"))
      return
    }
    // The cookie is already issued by the Server Action. Session refresh makes
    // the persistent header react immediately, but must not block navigation
    // if that follow-up request is interrupted.
    await updateSession().catch(() => undefined)
    router.push(loginDestination({ requestedRedirect, locale, role: result.role }))
    router.refresh()
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="identifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("emailOrPhone")}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("password")}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError && (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        )}

        <Button type="submit" size="lg" disabled={submitting} className="w-full">
          {submitting && <Loader2 className="animate-spin" />}
          {submitting ? t("signingIn") : t("signIn")}
        </Button>
        {emailEnabled && (
          <div className="flex justify-end text-small">
            <Link href="/forgot-password" className="text-link hover:underline">{t("forgotPassword")}</Link>
          </div>
        )}
      </form>
    </Form>
  )
}
