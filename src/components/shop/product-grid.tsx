import { useTranslations } from "next-intl"
import { Shirt } from "lucide-react"

import type { PublicProductSummary } from "@/db/queries/storefront"
import { ProductTile } from "@/components/shop/product-tile"

/** DESIGN.md §5/§8: 4 columns desktop -> 3 tablet -> 2 mobile -> 1 extra-small. */
export function ProductGrid({
  products,
  newCodes,
  priorityCount = 0,
}: {
  products: PublicProductSummary[]
  /** Product codes to flag with the "new" badge (e.g. the home "New in" strip). */
  newCodes?: Set<string>
  /** How many of the first tiles get `priority`/`eager` loading (above the fold). */
  priorityCount?: number
}) {
  const t = useTranslations()

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
        <Shirt className="size-10 opacity-40" aria-hidden />
        <p className="text-body">{t("shop.noResults")}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        <ProductTile
          key={product.id}
          product={product}
          isNew={newCodes?.has(product.productCode) ?? false}
          priority={index < priorityCount}
        />
      ))}
    </div>
  )
}
