import "server-only"

import { asc, eq } from "drizzle-orm"

import { db } from "@/db"
import {
  customerStatusLabels,
  orderItemStatuses,
  orderStatusLabels,
  shopSettings,
} from "@/db/schema"

export type OrderItemStatusDefinition = typeof orderItemStatuses.$inferSelect
export type OrderStatusLabel = typeof orderStatusLabels.$inferSelect
export type CustomerStatusLabel = typeof customerStatusLabels.$inferSelect
export type ShopSettings = typeof shopSettings.$inferSelect

export async function getOrderItemStatuses(options?: { activeOnly?: boolean }) {
  return db
    .select()
    .from(orderItemStatuses)
    .where(options?.activeOnly ? eq(orderItemStatuses.isActive, true) : undefined)
    .orderBy(asc(orderItemStatuses.sortOrder), asc(orderItemStatuses.code))
}

export async function getOrderStatusLabels() {
  return db.select().from(orderStatusLabels)
}

export async function getCustomerStatusLabels() {
  return db.select().from(customerStatusLabels)
}

export async function getShopSettings(): Promise<ShopSettings> {
  const fallback: ShopSettings = {
    id: "default",
    lineId: null,
    instagramHandle: null,
    updatedAt: new Date(0),
  }
  try {
    const [row] = await db
      .select()
      .from(shopSettings)
      .where(eq(shopSettings.id, "default"))
      .limit(1)
    return row ?? fallback
  } catch (error) {
    // Production builds may intentionally run before migrations (Railway's
    // documented bootstrap path). Missing settings safely disables checkout;
    // the admin page still surfaces schema failures once the app is running.
    if (process.env.NEXT_PHASE !== "phase-production-build") throw error
    console.warn("[settings] shop settings unavailable during build")
    return fallback
  }
}

export function contactLinks(settings: Pick<ShopSettings, "lineId" | "instagramHandle">) {
  const lineId = settings.lineId?.trim() ?? ""
  const instagramHandle = settings.instagramHandle?.trim().replace(/^@/, "") ?? ""
  return {
    lineUrl: lineId ? `https://line.me/R/ti/p/${lineId.startsWith("@") ? lineId : `@${lineId}`}` : null,
    instagramUrl: instagramHandle ? `https://instagram.com/${instagramHandle}` : null,
  }
}
