"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Copy, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatBaht } from "@/lib/format"
import { useRouter } from "@/i18n/navigation"
import type { PreorderShipmentRow } from "@/db/queries/orders"
import {
  addPreorderShipment,
  deletePreorderShipment,
  updatePreorderShipment,
} from "@/app/[locale]/admin/orders/shipment-actions"
import {
  preorderLegValues,
  type PreorderLeg,
  type PreorderShipmentValues,
} from "@/lib/validations/order"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Inbound tracking for ONE preorder line item bought from 1688 / Taobao —
 * items in the same order are often different lots from different sellers,
 * so each line has its own three legs (CN->CN seller to China warehouse,
 * CN->TH forwarder, TH->TH to the shop), any number of parcels per leg,
 * each with a tracking number and cost. All lines' costs add up to the
 * order's preorder shipping cost, which the database keeps in sync
 * (trigger) and folds into total cost and profit.
 *
 * Admin-only: nothing here reaches the customer's /track page.
 */

const LEG_LABEL_KEY: Record<PreorderLeg, string> = {
  cn_cn: "legCnCn",
  cn_th: "legCnTh",
  th_th: "legThTh",
}

const LEG_HINT_KEY: Record<PreorderLeg, string> = {
  cn_cn: "legCnCnHint",
  cn_th: "legCnThHint",
  th_th: "legThThHint",
}

type Draft = { carrier: string; trackingNo: string; cost: string; note: string }
const EMPTY_DRAFT: Draft = { carrier: "", trackingNo: "", cost: "", note: "" }

function toDraft(row: PreorderShipmentRow): Draft {
  return {
    carrier: row.carrier ?? "",
    trackingNo: row.trackingNo ?? "",
    cost: Number(row.cost) ? String(Number(row.cost)) : "",
    note: row.note ?? "",
  }
}

export function ItemPreorderShipments({
  orderId,
  orderItemId,
  shipments,
}: {
  orderId: string
  orderItemId: string
  /** This line's parcels only. */
  shipments: PreorderShipmentRow[]
}) {
  const t = useTranslations("order")
  const router = useRouter()
  const queryClient = useQueryClient()
  /** `new:<leg>` while adding to a leg, or a shipment id while editing. */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)

  const itemTotal = shipments.reduce((sum, row) => sum + Number(row.cost), 0)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    router.refresh()
  }

  async function save(leg: PreorderLeg, shipmentId?: string) {
    const values: PreorderShipmentValues = { leg, ...draft }
    setBusy(true)
    const result = shipmentId
      ? await updatePreorderShipment(orderId, shipmentId, values)
      : await addPreorderShipment(orderId, orderItemId, values)
    setBusy(false)
    if (!result.ok) {
      toast.error(t("shipmentSaveFailed"))
      return
    }
    setEditing(null)
    toast.success(t("shipmentSaved"))
    await refresh()
  }

  async function remove(row: PreorderShipmentRow) {
    if (!window.confirm(t("shipmentDeleteConfirm"))) return
    setBusy(true)
    const result = await deletePreorderShipment(orderId, row.id)
    setBusy(false)
    if (!result.ok) {
      toast.error(t("shipmentSaveFailed"))
      return
    }
    await refresh()
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("copied"))
    } catch {
      // Clipboard can be blocked — the number is still visible to select.
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-small font-bold">{t("preorderShipments")}</p>
        <p className="text-small text-muted-foreground">
          {t("itemPreorderShipping")}{" "}
          <span className="font-bold text-foreground tabular-nums">{formatBaht(itemTotal)}</span>
        </p>
      </div>

      {/* One column per leg, left to right = the parcel's journey. A leg's
          header lights up once it has at least one parcel. */}
      <div className="grid gap-2 md:grid-cols-3">
        {preorderLegValues.map((leg, index) => {
          const rows = shipments.filter((row) => row.leg === leg)
          const done = rows.length > 0
          const adding = editing === `new:${leg}`
          return (
            <section key={leg} className="flex flex-col rounded-md border border-border bg-card">
              <header
                className={cn(
                  "flex items-center gap-2 border-b border-border px-2.5 py-2",
                  done && "bg-primary/10"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-small",
                    done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-small font-bold", done ? "text-primary" : "text-foreground")}>
                    {t(LEG_LABEL_KEY[leg])}
                  </p>
                  <p className="truncate text-small text-muted-foreground">{t(LEG_HINT_KEY[leg])}</p>
                </div>
              </header>

              <ul className="flex-1 divide-y divide-border">
                {rows.map((row) =>
                  editing === row.id ? (
                    <li key={row.id} className="p-2">
                      <ShipmentEditor
                        draft={draft}
                        onChange={setDraft}
                        busy={busy}
                        onCancel={() => setEditing(null)}
                        onSave={() => save(leg, row.id)}
                      />
                    </li>
                  ) : (
                    <li key={row.id} className="space-y-0.5 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-body">{row.carrier || "—"}</span>
                        <span className="shrink-0 font-medium tabular-nums">{formatBaht(Number(row.cost))}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        {row.trackingNo ? (
                          <button
                            type="button"
                            onClick={() => copy(row.trackingNo!)}
                            className="inline-flex min-w-0 items-center gap-1 font-mono text-small hover:text-primary"
                            title={t("copyTracking")}
                          >
                            <span className="truncate">{row.trackingNo}</span>
                            <Copy className="size-3 shrink-0" aria-hidden />
                          </button>
                        ) : (
                          <span className="text-small text-muted-foreground">{t("noTracking")}</span>
                        )}
                        <span className="flex shrink-0">
                          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => { setEditing(row.id); setDraft(toDraft(row)) }} aria-label={t("editParcel")} disabled={busy}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => remove(row)} aria-label={t("deleteParcel")} disabled={busy}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </span>
                      </div>
                      {row.note && <p className="text-small text-muted-foreground">{row.note}</p>}
                    </li>
                  )
                )}
                {adding && (
                  <li className="p-2">
                    <ShipmentEditor
                      draft={draft}
                      onChange={setDraft}
                      busy={busy}
                      onCancel={() => setEditing(null)}
                      onSave={() => save(leg)}
                    />
                  </li>
                )}
              </ul>

              {!adding && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(`new:${leg}`)
                    setDraft(EMPTY_DRAFT)
                  }}
                  disabled={busy}
                  className="flex items-center justify-center gap-1 border-t border-dashed border-border py-1.5 text-small text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                >
                  <Plus className="size-3.5" />
                  {t("addParcel")}
                </button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Order-level roll-up shown once at the bottom of the fulfillment panel. */
export function ShippingCostTotals({
  preorderShippingCost,
  customerShippingCost,
}: {
  preorderShippingCost: number
  customerShippingCost: number
}) {
  const t = useTranslations("order")
  return (
    <dl className="mt-4 space-y-1 rounded-md bg-muted/50 p-3 text-body">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{t("preorderShippingCost")}</dt>
        <dd className="tabular-nums">{formatBaht(preorderShippingCost)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{t("shippingToCustomer")}</dt>
        <dd className="tabular-nums">{formatBaht(customerShippingCost)}</dd>
      </div>
      <div className="flex justify-between border-t border-border pt-1 font-bold">
        <dt>{t("totalShippingCost")}</dt>
        <dd className="tabular-nums">{formatBaht(preorderShippingCost + customerShippingCost)}</dd>
      </div>
    </dl>
  )
}

/** Stacked inputs — sized for a narrow leg column. */
function ShipmentEditor({
  draft,
  onChange,
  busy,
  onCancel,
  onSave,
}: {
  draft: Draft
  onChange: (next: Draft) => void
  busy: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const t = useTranslations("order")
  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, [key]: e.target.value }),
  })

  return (
    <div
      className="grid gap-1.5"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onSave()
        } else if (e.key === "Escape") {
          onCancel()
        }
      }}
    >
      <Input placeholder={t("parcelCarrier")} aria-label={t("parcelCarrier")} maxLength={80} autoFocus className="h-9" {...field("carrier")} />
      <Input placeholder={t("trackingNo")} aria-label={t("trackingNo")} maxLength={80} className="h-9 font-mono" {...field("trackingNo")} />
      <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder={t("parcelCost")} aria-label={t("parcelCost")} className="h-9" {...field("cost")} />
      <Input placeholder={t("parcelNote")} aria-label={t("parcelNote")} maxLength={500} className="h-9" {...field("note")} />
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X />
          {t("cancelParcel")}
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />}
          {t("saveParcel")}
        </Button>
      </div>
    </div>
  )
}
