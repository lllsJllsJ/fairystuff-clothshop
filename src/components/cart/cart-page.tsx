"use client"

import Image from "next/image"
import { Minus, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"

import { useCart } from "@/components/cart/cart-provider"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"
import { formatBaht } from "@/lib/format"

export function CartPage() {
  const t = useTranslations("cart")
  const cart = useCart()

  if (!cart.hydrated) return <div className="mx-auto max-w-4xl px-4 py-12 text-muted-foreground">{t("loading")}</div>
  if (cart.items.length === 0) return <div className="mx-auto max-w-2xl px-4 py-21 text-center">
    <h1 className="text-h2 font-bold">{t("title")}</h1>
    <p className="mt-3 text-body text-muted-foreground">{t("empty")}</p>
    <Button className="mt-6" render={<Link href="/shop" />} nativeButton={false}>{t("continueShopping")}</Button>
  </div>

  return <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <h1 className="mb-6 text-h2 font-bold">{t("title")}</h1>
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="divide-y divide-border border border-border bg-card">
        {cart.items.map((item) => <div key={item.key} className="flex gap-4 p-4">
          <div className="relative size-24 shrink-0 bg-muted">
            {item.imageUrl && <Image src={item.imageUrl} alt={item.productName} fill sizes="96px" className="object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/shop/${item.productCode}`} className="font-bold hover:text-link">{item.productName}</Link>
            <p className="text-small text-muted-foreground">{[item.color, item.size].filter(Boolean).join(" · ") || item.productCode}</p>
            <p className="mt-1 font-medium text-primary">{formatBaht(Number(item.sellPrice))}</p>
            <div className="mt-3 flex items-center gap-2">
              <Button size="icon-sm" variant="outline" onClick={() => cart.updateQuantity(item.key, item.quantity - 1)} aria-label={t("decrease")}><Minus /></Button>
              <span className="w-8 text-center tabular-nums">{item.quantity}</span>
              <Button size="icon-sm" variant="outline" onClick={() => cart.updateQuantity(item.key, item.quantity + 1)} aria-label={t("increase")}><Plus /></Button>
              <Button size="icon-sm" variant="ghost" className="ml-auto text-destructive" onClick={() => cart.removeItem(item.key)} aria-label={t("remove")}><Trash2 /></Button>
            </div>
          </div>
        </div>)}
      </div>
      <aside className="h-fit border border-border bg-card p-5">
        <h2 className="text-subtitle font-bold">{t("summary")}</h2>
        <div className="mt-4 flex justify-between text-body"><span>{t("subtotal")}</span><span className="font-bold">{formatBaht(cart.subtotal)}</span></div>
        <p className="mt-3 text-small text-muted-foreground">{t("shippingLater")}</p>
        <Button className="mt-5 w-full" size="lg" render={<Link href="/checkout" />} nativeButton={false}>{t("checkout")}</Button>
      </aside>
    </div>
  </div>
}
