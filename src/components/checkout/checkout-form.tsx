"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

import { submitCheckout } from "@/app/[locale]/(shop)/checkout/actions"
import { useCart } from "@/components/cart/cart-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useRouter } from "@/i18n/navigation"
import { formatBaht } from "@/lib/format"

export function CheckoutForm({ name, email, contactReady }: { name: string; email: string; contactReady: boolean }) {
  const t = useTranslations("checkout")
  const cart = useCart()
  const router = useRouter()
  const [checkoutKey] = useState(() => crypto.randomUUID())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null)
    const data = new FormData(event.currentTarget)
    const result = await submitCheckout({
      checkoutKey,
      customerPhone: String(data.get("phone") ?? ""),
      customerAddress: String(data.get("address") ?? ""),
      note: String(data.get("note") ?? ""),
      items: cart.items.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        expectedSellPrice: item.sellPrice,
        quantity: item.quantity,
      })),
    })
    setPending(false)
    if (!result.ok) {
      setError(t(result.error === "cart_changed" ? "cartChanged" : result.error === "contact_missing" ? "contactMissing" : "failed"))
      return
    }
    cart.clear()
    router.push(`/checkout/success/${result.id}`)
  }

  if (!cart.hydrated) return <p>{t("loading")}</p>
  if (cart.items.length === 0) return <div className="border border-border bg-card p-6 text-center"><p>{t("empty")}</p><Button className="mt-4" onClick={() => router.push("/shop")}>{t("shop")}</Button></div>

  return <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_340px]">
    <section className="space-y-4 border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("delivery")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <ReadOnlyField label={t("name")} value={name} />
        <ReadOnlyField label={t("email")} value={email} />
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="phone">{t("phone")}</Label><Input id="phone" name="phone" type="tel" required minLength={5} maxLength={30} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="address">{t("address")}</Label><Textarea id="address" name="address" required minLength={5} maxLength={500} rows={4} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="note">{t("note")}</Label><Textarea id="note" name="note" maxLength={2000} rows={2} /></div>
      </div>
    </section>
    <aside className="h-fit border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("summary")}</h2>
      <ul className="mt-4 space-y-2 text-small">{cart.items.map((item) => <li key={item.key} className="flex justify-between gap-3"><span>{item.productName} × {item.quantity}</span><span>{formatBaht(Number(item.sellPrice) * item.quantity)}</span></li>)}</ul>
      <div className="mt-4 flex justify-between border-t border-border pt-4 font-bold"><span>{t("subtotal")}</span><span>{formatBaht(cart.subtotal)}</span></div>
      <p className="mt-3 text-small text-muted-foreground">{t("noPayment")}</p>
      {!contactReady && <p className="mt-3 text-small text-destructive">{t("contactMissing")}</p>}
      {error && <p role="alert" className="mt-3 text-small text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="mt-5 w-full" disabled={pending || !contactReady}>{pending && <Loader2 className="animate-spin" />}{t("placeOrder")}</Button>
    </aside>
  </form>
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><div className="min-h-10 border border-input bg-muted px-3 py-2 text-body">{value}</div></div>
}
