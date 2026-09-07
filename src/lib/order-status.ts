import type { OrderStatusValue } from "@/db/queries/orders"

export type CustomerOrderStage = "received" | "preparing" | "shipping" | "complete" | "cancelled" | "refunded"

export const CUSTOMER_ORDER_STAGES = ["received", "preparing", "shipping", "complete", "cancelled", "refunded"] as const

export function customerStageFor(status: OrderStatusValue): CustomerOrderStage {
  switch (status) {
    case "new": return "received"
    case "accepted":
    case "preorder":
    case "packaging": return "preparing"
    case "shipping": return "shipping"
    case "complete": return "complete"
    case "cancelled": return "cancelled"
    case "refund": return "refunded"
  }
}

export const DEFAULT_ADMIN_STATUS_LABELS: Record<OrderStatusValue, { th: string; en: string }> = {
  new: { th: "รับออเดอร์ใหม่", en: "New" },
  accepted: { th: "รับออเดอร์แล้ว", en: "Accepted" },
  preorder: { th: "กำลังพรีออเดอร์", en: "Preorder" },
  packaging: { th: "กำลังแพ็ก", en: "Packaging" },
  shipping: { th: "กำลังจัดส่ง", en: "Shipping" },
  complete: { th: "สำเร็จ", en: "Complete" },
  cancelled: { th: "ยกเลิก", en: "Cancelled" },
  refund: { th: "คืนเงิน", en: "Refund" },
}

export const DEFAULT_CUSTOMER_STATUS_LABELS: Record<CustomerOrderStage, { th: string; en: string }> = {
  received: { th: "รับคำสั่งซื้อแล้ว", en: "Received" },
  preparing: { th: "กำลังเตรียมสินค้า", en: "Preparing" },
  shipping: { th: "กำลังจัดส่ง", en: "Shipping" },
  complete: { th: "สำเร็จ", en: "Complete" },
  cancelled: { th: "ยกเลิก", en: "Cancelled" },
  refunded: { th: "คืนเงินแล้ว", en: "Refunded" },
}

export function customerStatusLabel(
  stage: CustomerOrderStage,
  locale: string,
  rows: { stage: CustomerOrderStage; labelTh: string; labelEn: string }[]
) {
  const row = rows.find((item) => item.stage === stage)
  return locale === "en"
    ? (row?.labelEn ?? DEFAULT_CUSTOMER_STATUS_LABELS[stage].en)
    : (row?.labelTh ?? DEFAULT_CUSTOMER_STATUS_LABELS[stage].th)
}

/**
 * The 4 non-terminal stages the tracking page's stepper visualizes.
 * `cancelled`/`refunded` are exceptions outside the normal progression (see
 * `order-status-badge.tsx`'s comment on why they get distinct treatment) and
 * never render the stepper — only the badge plus a short explanation.
 */
export type ActiveCustomerStage = Exclude<CustomerOrderStage, "cancelled" | "refunded">

export function isActiveStage(stage: CustomerOrderStage): stage is ActiveCustomerStage {
  return stage !== "cancelled" && stage !== "refunded"
}

export type LeadTimeEstimate = { min: number; max: number }

/**
 * Order-level lead-time estimate: "slowest item wins". The shop can't ship
 * until every item is ready, so the bottleneck item's range determines the
 * whole order's estimate. `preorderMinDays`/`preorderMaxDays` are always
 * both-null or both-set per item (snapshotted together from the product's
 * already-constrained pair — see schema.ts), so filtering on one implies
 * the other is present too. Returns null when no item in the order carries
 * a lead-time range at all — never fabricate a "0-0 days" estimate.
 */
export function estimatedLeadTime(
  items: { preorderMinDays: number | null; preorderMaxDays: number | null }[]
): LeadTimeEstimate | null {
  const withEstimate = items.filter(
    (item): item is { preorderMinDays: number; preorderMaxDays: number } =>
      item.preorderMinDays !== null && item.preorderMaxDays !== null
  )
  if (withEstimate.length === 0) return null
  return {
    min: Math.max(...withEstimate.map((item) => item.preorderMinDays)),
    max: Math.max(...withEstimate.map((item) => item.preorderMaxDays)),
  }
}
