import Image from "next/image"
import { useTranslations } from "next-intl"
import { Shirt } from "lucide-react"

import { Link } from "@/i18n/navigation"
import type { PublicProductSummary } from "@/db/queries/storefront"
import { Price } from "@/components/shop/price"
import { SoldOutBadge, NewBadge } from "@/components/shop/sold-out-badge"

const SWATCH_LIMIT = 4

/**
 * DESIGN.md §4 Product Card: white surface, 1px #DDDDDD border, 0 radius,
 * no shadow by default, `--shadow-raised-md` on hover only. `product` is
 * `PublicProductSummary` — every field on that type is already safe to
 * render (see the header comment in src/db/queries/storefront.ts); there is
 * nothing to trim before passing it down.
 */
export function ProductTile({
  product,
  isNew = false,
  priority = false,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
  product: PublicProductSummary
  isNew?: boolean
  priority?: boolean
  sizes?: string
}) {
  const t = useTranslations()
  const extraColors = Math.max(0, product.colors.length - SWATCH_LIMIT)

  return (
    <Link
      href={`/shop/${product.productCode}`}
      className="group flex h-full flex-col border border-[var(--border-lighter)] bg-card transition-shadow duration-200 hover:shadow-[var(--shadow-raised-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        {product.coverImageUrl ? (
          <Image
            src={product.coverImageUrl}
            alt={product.productName}
            fill
            sizes={sizes}
            loading={priority ? "eager" : "lazy"}
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Shirt className="size-10 opacity-40" aria-hidden />
            <span className="text-small">{t("shop.noImage")}</span>
          </div>
        )}

        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {isNew && <NewBadge />}
          {!product.inStock && <SoldOutBadge />}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {product.productType && (
          <p className="truncate text-small text-muted-foreground">{product.productType}</p>
        )}
        <h3 className="line-clamp-2 text-body font-bold text-foreground">
          {product.productName}
        </h3>

        {product.colors.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5" aria-hidden>
            {product.colors.slice(0, SWATCH_LIMIT).map((color) => (
              <span
                key={color}
                className="border border-[var(--border-lighter)] px-1.5 py-0.5 text-small text-muted-foreground"
              >
                {color}
              </span>
            ))}
            {extraColors > 0 && (
              <span className="text-small text-muted-foreground">+{extraColors}</span>
            )}
          </div>
        )}

        <div className="mt-auto pt-2">
          <Price value={product.sellPrice} />
        </div>
      </div>
    </Link>
  )
}

