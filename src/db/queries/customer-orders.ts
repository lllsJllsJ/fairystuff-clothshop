import "server-only"

import { and, asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { orderItems, orders } from "@/db/schema"

export type CustomerOrderRow = typeof orders.$inferSelect
export type CustomerOrderWithItems = CustomerOrderRow & { items: (typeof orderItems.$inferSelect)[] }

export async function getCustomerOrders(customerId: string): Promise<CustomerOrderRow[]> {
  return db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt))
}

export async function getCustomerOrderById(id: string, customerId: string): Promise<CustomerOrderWithItems | null> {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.customerId, customerId))).limit(1)
  if (!order) return null
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.sortOrder))
  return { ...order, items }
}
