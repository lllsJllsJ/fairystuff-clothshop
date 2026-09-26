"use server"

import { and, eq, max } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { orderItems, preorderShipments } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth-helpers"
import { isOwner } from "@/lib/roles"
import {
  preorderShipmentSchema,
  type PreorderShipmentValues,
} from "@/lib/validations/order"

import { revalidateOrders } from "./revalidate"

/**
 * Preorder shipments — the inbound legs of a preorder (CN->CN seller to
 * China warehouse, CN->TH forwarder, TH->TH to the shop), each with its own
 * tracking number and cost. Parcels belong to one LINE ITEM: items in the
 * same order are often different lots from different sellers. ADMIN-ONLY data: never selected by
 * /track/[code] (see src/db/queries/track.ts).
 *
 * Every action re-checks `isOwner()` itself (no RLS behind it — see
 * CLAUDE.md's security model) and scopes every write by BOTH the shipment
 * id and its order id, so a shipment id from one order can't be edited
 * through another. A new parcel's line item must belong to that order.
 *
 * `orders.preorder_shipping_cost` is recomputed by the
 * `preorder_shipments_recalc` trigger on every insert/update/delete here —
 * never written directly — and `orders.total_cost` / `orders.profit` are
 * generated from it.
 */

export type ShipmentResult = { ok: true; id: string } | { ok: false; error: string }

const idSchema = z.uuid()

function toNullable(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed.length ? trimmed : null
}

async function authorize(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }
  return { ok: true }
}

function toRow(values: z.output<typeof preorderShipmentSchema>) {
  return {
    leg: values.leg,
    carrier: toNullable(values.carrier),
    trackingNo: toNullable(values.trackingNo),
    cost: values.cost.toFixed(2),
    note: toNullable(values.note),
  }
}

export async function addPreorderShipment(
  orderId: string,
  orderItemId: string,
  values: PreorderShipmentValues
): Promise<ShipmentResult> {
  const auth = await authorize()
  if (!auth.ok) return auth

  const parsed = preorderShipmentSchema.safeParse(values)
  if (!idSchema.safeParse(orderId).success || !idSchema.safeParse(orderItemId).success || !parsed.success) {
    return { ok: false, error: "invalid" }
  }

  try {
    // The line must belong to this order — never trust the pairing.
    const [item] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)))
      .limit(1)
    if (!item) return { ok: false, error: "not_found" }

    const [{ value: lastSort } = { value: null }] = await db
      .select({ value: max(preorderShipments.sortOrder) })
      .from(preorderShipments)
      .where(eq(preorderShipments.orderItemId, orderItemId))

    const [row] = await db
      .insert(preorderShipments)
      .values({ orderId, orderItemId, ...toRow(parsed.data), sortOrder: (lastSort ?? -1) + 1 })
      .returning({ id: preorderShipments.id })
    if (!row) return { ok: false, error: "insert_failed" }

    revalidateOrders(orderId)
    return { ok: true, id: row.id }
  } catch (error) {
    console.error("addPreorderShipment failed", error)
    return { ok: false, error: "insert_failed" }
  }
}

export async function updatePreorderShipment(
  orderId: string,
  shipmentId: string,
  values: PreorderShipmentValues
): Promise<ShipmentResult> {
  const auth = await authorize()
  if (!auth.ok) return auth

  const parsed = preorderShipmentSchema.safeParse(values)
  if (!idSchema.safeParse(orderId).success || !idSchema.safeParse(shipmentId).success || !parsed.success) {
    return { ok: false, error: "invalid" }
  }

  try {
    const [row] = await db
      .update(preorderShipments)
      .set(toRow(parsed.data))
      .where(and(eq(preorderShipments.id, shipmentId), eq(preorderShipments.orderId, orderId)))
      .returning({ id: preorderShipments.id })
    if (!row) return { ok: false, error: "not_found" }

    revalidateOrders(orderId)
    return { ok: true, id: row.id }
  } catch (error) {
    console.error("updatePreorderShipment failed", error)
    return { ok: false, error: "update_failed" }
  }
}

export async function deletePreorderShipment(
  orderId: string,
  shipmentId: string
): Promise<ShipmentResult> {
  const auth = await authorize()
  if (!auth.ok) return auth
  if (!idSchema.safeParse(orderId).success || !idSchema.safeParse(shipmentId).success) {
    return { ok: false, error: "invalid" }
  }

  try {
    const [row] = await db
      .delete(preorderShipments)
      .where(and(eq(preorderShipments.id, shipmentId), eq(preorderShipments.orderId, orderId)))
      .returning({ id: preorderShipments.id })
    if (!row) return { ok: false, error: "not_found" }

    revalidateOrders(orderId)
    return { ok: true, id: row.id }
  } catch (error) {
    console.error("deletePreorderShipment failed", error)
    return { ok: false, error: "delete_failed" }
  }
}
