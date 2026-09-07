import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { CheckCircle2 } from "lucide-react"

import { getOrderByPreorderCode } from "@/db/queries/track"
import { getCustomerStatusLabels, getShopSettings, lineMessageUrl } from "@/db/queries/settings"
import { normalizePreorderCode } from "@/lib/preorder-code"
import {
  customerStageFor,
  customerStatusLabel,
  estimatedLeadTime,
  isActiveStage,
} from "@/lib/order-status"
import { formatBaht, formatDate } from "@/lib/format"
import { CustomerStatusBadge } from "@/components/track/customer-status-badge"
import { PreorderCodeCopy } from "@/components/track/preorder-code-copy"
import { ContactAdminButton } from "@/components/track/contact-admin-button"
import { ACTIVE_STAGES, StatusStepper, STAGE_BODY_KEY, STAGE_TITLE_KEY } from "@/components/track/status-stepper"
import { OrderTimeline } from "@/components/track/order-timeline"

/**
 * `force-dynamic` is the single most important line in this file.
 * `src/app/[locale]/(shop)/layout.tsx` sets `export const revalidate = 300`
 * as a floor for the whole storefront subtree — without this override,
 * order status here would be up to 5 minutes stale, which defeats the only
 * reason this page exists. Confirm the production build prints `ƒ` for
 * `/[locale]/track/[code]`, not `●`.
 */
export const dynamic = "force-dynamic"

// Never indexed: a preorder code is a bearer credential for reading one
// order, not public content. See src/app/robots.ts's matching disallow rule.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function TrackOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const [{ code: rawCode }, { new: isNew }] = await Promise.all([params, searchParams])

  // Validate shape BEFORE looking anything up, then return the exact same
  // 404 either way (malformed code vs. a well-shaped but unknown one) — see
  // the file-level note below. Never let a malformed code differentiate its
  // response from an unknown one; that distinction is exactly what an
  // enumeration attempt would use to narrow its search.
  const code = normalizePreorderCode(rawCode)
  const order = code ? await getOrderByPreorderCode(code) : null
  if (!order) notFound()

  const [settings, labels, locale, t] = await Promise.all([
    getShopSettings(),
    getCustomerStatusLabels(),
    getLocale(),
    getTranslations("track"),
  ])

  const dateLocale = locale === "en" ? "en-US" : "th-TH"
  const stage = customerStageFor(order.status)
  const message = t("lineMessage", { code: order.preorderCode })
  const lineHref = lineMessageUrl(settings, message)
  const shipping = Number(order.shippingCost)
  const itemsTotal = Number(order.itemsTotal)
  const leadTime = estimatedLeadTime(order.items)

  const stepLabels = Object.fromEntries(
    ACTIVE_STAGES.map((s) => [s, customerStatusLabel(s, locale, labels)])
  ) as Record<(typeof ACTIVE_STAGES)[number], string>
  const statusLabel = customerStatusLabel(stage, locale, labels)

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {isNew && (
        <div className="mb-8 text-center">
          <CheckCircle2 className="mx-auto size-14 text-primary" />
          <h1 className="mt-4 text-h2 font-bold">{t("received")}</h1>
          <p className="mt-3 text-body text-muted-foreground">{t("receivedBody")}</p>
        </div>
      )}

      <header className="text-center">
        <p className="text-small font-bold tracking-wide text-muted-foreground uppercase">{t("orderLabel")}</p>
        <PreorderCodeCopy code={order.preorderCode} />
        <p className="mt-3 text-small text-muted-foreground">{formatDate(order.orderDate, dateLocale)}</p>
      </header>

      <div className="mt-6 flex flex-col items-center gap-3 text-center">
        {lineHref && <ContactAdminButton href={lineHref} code={order.preorderCode} />}
        {/* The LINE deep-link scheme is unsupported on LINE for PC — the
            prefill silently drops there. The copy button above and the
            fire-and-forget copy on this button are the real fallback; this
            hint just tells a desktop customer why they need it. */}
        {lineHref && <p className="text-small text-muted-foreground">{t("desktopHint")}</p>}
      </div>

      <section className="mt-8 border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">{t("status")}</h2>
          <CustomerStatusBadge stage={stage} label={statusLabel} />
        </div>

        {isActiveStage(stage) ? (
          <>
            <div className="mt-6">
              <StatusStepper stage={stage} labels={stepLabels} />
            </div>
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="font-bold">{t(STAGE_TITLE_KEY[stage])}</h3>
              <p className="mt-1 text-body text-muted-foreground">{t(STAGE_BODY_KEY[stage])}</p>
              {stage === "preparing" && leadTime && (
                <p className="mt-3 inline-block bg-warning/15 px-3 py-1.5 text-body font-bold text-foreground">
                  {t("leadTimeEstimate", { min: leadTime.min, max: leadTime.max })}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="mt-3 text-body text-muted-foreground">
            {t(stage === "cancelled" ? "cancelledExplanation" : "refundedExplanation")}
          </p>
        )}
      </section>

      <section className="mt-4 border border-border bg-card p-5">
        <h2 className="font-bold">{t("timelineTitle")}</h2>
        <div className="mt-3">
          <OrderTimeline
            orderDate={order.orderDate}
            updatedAt={order.updatedAt}
            stage={stage}
            receivedLabel={t("received")}
            currentLabel={statusLabel}
            locale={locale}
          />
        </div>
      </section>

      <section className="mt-4 border border-border bg-card p-5">
        <h2 className="font-bold">{t("items")}</h2>
        <div className="mt-3 divide-y divide-border">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-4 py-3">
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-small text-muted-foreground">
                  {[item.color, item.size].filter(Boolean).join(" · ")} · × {item.quantity}
                </p>
              </div>
              <span>{formatBaht(Number(item.sellPrice) * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 border-t border-border pt-4 text-body">
          <div className="flex justify-between">
            <span>{t("subtotal")}</span>
            <span>{formatBaht(itemsTotal)}</span>
          </div>
          {order.shippingConfirmedAt ? (
            <>
              <div className="flex justify-between">
                <span>{t("shipping")}</span>
                <span>{formatBaht(shipping)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>{t("total")}</span>
                <span>{formatBaht(itemsTotal + shipping)}</span>
              </div>
            </>
          ) : (
            <p className="text-small text-muted-foreground">{t("shippingPending")}</p>
          )}
        </div>
      </section>

      <section className="mt-4 border border-border bg-card p-5">
        <h2 className="font-bold">{t("delivery")}</h2>
        <p className="mt-2 text-body">{order.customerName}</p>
        {order.customerPhone && <p className="text-body">{order.customerPhone}</p>}
        {order.customerAddress && <p className="whitespace-pre-line text-body text-muted-foreground">{order.customerAddress}</p>}
      </section>

      {order.note && (
        <section className="mt-4 border border-border bg-card p-5">
          <h2 className="font-bold">{t("note")}</h2>
          <p className="mt-2 whitespace-pre-wrap text-body text-muted-foreground">{order.note}</p>
        </section>
      )}
    </div>
  )
}
