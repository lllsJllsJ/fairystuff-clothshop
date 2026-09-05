"use client"

import Image from "next/image"
import { useTranslations } from "next-intl"
import { Shirt } from "lucide-react"

import { Link } from "@/i18n/navigation"
import { formatBaht, formatNumber } from "@/lib/format"
import type { ProductWithRelations } from "@/db/queries/products"
import { Badge } from "@/components/ui/badge"

/** Admin card — utilitarian is correct here (plan §12): code, name, cover,
 * cost, price, margin, and stock summary, no editorial styling. */
export function ProductAdminCard({ product }: { product: ProductWithRelations }) {
  const t = useTranslations()
  const cover = product.images[0]
  const totalQuantity = product.variants.reduce((sum, v) => sum + v.quantity, 0)
  const isSoldOut = product.variants.length > 0 && totalQuantity === 0
  const margin = Number(product.sellPrice) - Number(product.originalPrice)

  return (
    <Link
      href={`/admin/products/${product.id}/edit`}
      className="group flex flex-col overflow-hidden border border-border bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {cover ? (
          <Image
            src={cover.url}
            alt={cover.alt ?? product.productName}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <Shirt className="size-8 opacity-40" />
            <span className="text-small">{t("product.noImage")}</span>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <ProductStatusBadge status={product.status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-body font-bold text-foreground">{product.productName}</p>
        <p className="text-small text-muted-foreground">{product.productCode}</p>
        {product.productType && (
          <p className="truncate text-small text-muted-foreground">{product.productType}</p>
        )}
        {product.characters.length > 0 && (
          <p className="line-clamp-1 text-small text-muted-foreground">
            {product.characters.map((character) => character.name).join(", ")}
          </p>
        )}
        <p className="text-small font-medium text-foreground">
          {t("product.preorderLeadTime")}: {product.preorderMinDays != null && product.preorderMaxDays != null
            ? t("product.preorderDaysRange", { min: product.preorderMinDays, max: product.preorderMaxDays })
            : t("product.preorderNotSet")}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex flex-col">
            <span className="text-body font-bold text-primary">
              {formatBaht(Number(product.sellPrice))}
            </span>
            <span className="text-small text-muted-foreground">
              {t("product.margin")}: {formatBaht(margin)}
            </span>
          </div>
          <span className="shrink-0 text-small text-muted-foreground">
            {isSoldOut
              ? t("product.soldOut")
              : `${formatNumber(totalQuantity)} ${t("variant.quantity")}`}
          </span>
        </div>
      </div>
    </Link>
  )
}

export function ProductStatusBadge({ status }: { status: "draft" | "active" | "archived" }) {
  const t = useTranslations()
  const variant = status === "active" ? "default" : status === "draft" ? "secondary" : "outline"
  const label =
    status === "active"
      ? t("product.statusActive")
      : status === "draft"
        ? t("product.statusDraft")
        : t("product.statusArchived")
  return <Badge variant={variant}>{label}</Badge>
}
