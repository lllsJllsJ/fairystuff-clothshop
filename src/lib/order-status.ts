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
