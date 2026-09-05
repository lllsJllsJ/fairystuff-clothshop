import { getTranslations } from "next-intl/server"

import { formatBaht, formatDate, formatDateTime } from "@/lib/format"
import type { OrderWithItems } from "@/db/queries/orders"

/**
 * Print-only receipt view — a plain, non-interactive render of the order
 * built straight from `OrderWithItems` (server component, no client JS
 * needed). Shown only under Tailwind's `print:` variant on the order
 * detail page; the interactive `OrderForm` is hidden the same way in the
 * other direction (`print:hidden`), so printing the page yields a clean
 * receipt instead of the edit form's inputs and buttons.
 */
export async function OrderReceipt({
  order,
  statusLabel,
}: {
  order: OrderWithItems
  statusLabel: string
}) {
  const t = await getTranslations()

  const itemsTotal = Number(order.itemsTotal)
  const shipping = Number(order.shippingCost)
  const packing = Number(order.packingCost)
  const amountDue = itemsTotal + shipping + packing

  return (
    <div className="hidden space-y-4 print:block">
      <div className="flex items-baseline justify-between border-b border-border pb-3">
        <h2 className="text-h4 font-bold text-foreground">{t("order.receiptTitle")}</h2>
        <span className="text-small text-muted-foreground">
          {t("order.printedOn")}: {formatDateTime(new Date())}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-body">
        <div>
          <p className="font-bold text-foreground">{t("order.orderInfo")}</p>
          <p>
            {t("order.orderNo")}: #{order.orderNo}
          </p>
          <p>
            {t("order.orderDate")}: {formatDate(order.orderDate)}
          </p>
          <p>
            {t("order.status")}: {statusLabel}
          </p>
        </div>
        <div>
          <p className="font-bold text-foreground">{t("order.shipTo")}</p>
          <p>{order.customerName}</p>
          {order.customerPhone && <p>{order.customerPhone}</p>}
          {order.customerAddress && <p>{order.customerAddress}</p>}
        </div>
      </div>

      <table className="w-full border-collapse text-body">
        <thead>
          <tr>
            <th className="border-b border-border py-1.5 text-left">{t("product.code")}</th>
            <th className="border-b border-border py-1.5 text-left">{t("product.name")}</th>
            <th className="border-b border-border py-1.5 text-left">{t("variant.color")}</th>
            <th className="border-b border-border py-1.5 text-left">{t("variant.size")}</th>
            <th className="border-b border-border py-1.5 text-right">{t("variant.quantity")}</th>
            <th className="border-b border-border py-1.5 text-right">{t("product.sellPrice")}</th>
            <th className="border-b border-border py-1.5 text-right">{t("order.lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="border-b border-border py-1.5">{item.productCode}</td>
              <td className="border-b border-border py-1.5">{item.productName}</td>
              <td className="border-b border-border py-1.5">{item.color || "-"}</td>
              <td className="border-b border-border py-1.5">{item.size || "-"}</td>
              <td className="border-b border-border py-1.5 text-right tabular-nums">
                {item.quantity}
              </td>
              <td className="border-b border-border py-1.5 text-right tabular-nums">
                {formatBaht(Number(item.sellPrice))}
              </td>
              <td className="border-b border-border py-1.5 text-right tabular-nums">
                {formatBaht(Number(item.lineTotal))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto max-w-xs space-y-1 text-body">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("order.itemsTotal")}</span>
          <span className="tabular-nums">{formatBaht(itemsTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("order.shippingCost")}</span>
          <span className="tabular-nums">{formatBaht(shipping)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("order.packingCost")}</span>
          <span className="tabular-nums">{formatBaht(packing)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-bold text-foreground">
          <span>{t("order.amountDue")}</span>
          <span className="tabular-nums">{formatBaht(amountDue)}</span>
        </div>
      </div>

      {order.note && (
        <div className="border-t border-border pt-3 text-body">
          <p className="font-bold text-foreground">{t("order.note")}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{order.note}</p>
        </div>
      )}
    </div>
  )
}
