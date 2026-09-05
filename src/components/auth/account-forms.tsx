"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"

import {
  registerCustomer,
  resendVerification,
  requestPasswordReset,
  resetPassword,
} from "@/app/[locale]/(auth)/account-actions"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function RegisterForm() {
  const t = useTranslations("auth")
  const locale = useLocale()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setPending(true); setError(null); setMessage(null)
    const data = new FormData(form)
    const result = await registerCustomer({
      fullname: String(data.get("fullname") ?? ""),
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
    }, locale)
    setPending(false)
    if (!result.ok) return setError(t(result.error === "email_failed" ? "emailFailed" : "invalidForm"))
    setMessage(t(result.emailEnabled ? "checkEmail" : "accountReady"))
    form.reset()
  }

  return <form onSubmit={submit} className="space-y-4">
    <AuthField label={t("fullName")} name="fullname" autoComplete="name" />
    <AuthField label={t("email")} name="email" type="email" autoComplete="email" />
    <AuthField label={t("password")} name="password" type="password" autoComplete="new-password" />
    <AuthField label={t("confirmPassword")} name="confirmPassword" type="password" autoComplete="new-password" />
    {error && <p role="alert" className="text-small text-destructive">{error}</p>}
    {message && <p role="status" className="text-small text-foreground">{message}</p>}
    <Button className="w-full" size="lg" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{t("createAccount")}</Button>
    <Link href="/login" className="block text-center text-small text-link hover:underline">{t("alreadyHaveAccount")}</Link>
  </form>
}

export function ForgotPasswordForm({ enabled }: { enabled: boolean }) {
  const t = useTranslations("auth")
  const locale = useLocale()
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true)
    await requestPasswordReset(String(new FormData(event.currentTarget).get("email") ?? ""), locale)
    setPending(false); setSent(true)
  }
  if (!enabled) return <p className="text-body text-muted-foreground">{t("emailDisabled")}</p>
  return <form onSubmit={submit} className="space-y-4">
    <AuthField label={t("email")} name="email" type="email" autoComplete="email" />
    {sent && <p role="status" className="text-small">{t("resetSent")}</p>}
    <Button className="w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{t("sendReset")}</Button>
  </form>
}

export function ResendVerificationForm({ enabled }: { enabled: boolean }) {
  const t = useTranslations("auth")
  const locale = useLocale()
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setPending(true)
    await resendVerification(String(new FormData(form).get("email") ?? ""), locale)
    setPending(false)
    setSent(true)
  }
  if (!enabled) return <p className="text-body text-muted-foreground">{t("emailDisabled")}</p>
  return <form onSubmit={submit} className="space-y-4">
    <AuthField label={t("email")} name="email" type="email" autoComplete="email" />
    {sent && <p role="status" className="text-small">{t("verificationSent")}</p>}
    <Button className="w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{t("resendVerification")}</Button>
  </form>
}

export function ResetPasswordForm({ token, enabled }: { token: string; enabled: boolean }) {
  const t = useTranslations("auth")
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(false)
    const data = new FormData(event.currentTarget)
    const result = await resetPassword({
      token,
      password: String(data.get("password") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
    })
    setPending(false)
    if (!result.ok) return setError(true)
    setDone(true)
  }
  if (!enabled) return <p className="text-body text-muted-foreground">{t("emailDisabled")}</p>
  if (done) return <p className="text-body"><Link href="/login" className="text-link hover:underline">{t("passwordUpdated")}</Link></p>
  return <form onSubmit={submit} className="space-y-4">
    <AuthField label={t("password")} name="password" type="password" autoComplete="new-password" />
    <AuthField label={t("confirmPassword")} name="confirmPassword" type="password" autoComplete="new-password" />
    {error && <p role="alert" className="text-small text-destructive">{t("invalidReset")}</p>}
    <Button className="w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{t("resetPassword")}</Button>
  </form>
}

function AuthField({ label, name, type = "text", autoComplete }: { label: string; name: string; type?: string; autoComplete?: string }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} autoComplete={autoComplete} required /></div>
}
