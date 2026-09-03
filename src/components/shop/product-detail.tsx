"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"

import type { PublicProductDetail } from "@/db/queries/storefront"
import { Price } from "@/components/shop/price"
import { SoldOutBadge } from "@/components/shop/sold-out-badge"
import { ProductGallery } from "@/components/shop/product-gallery"
import { ColorSelector } from "@/components/shop/color-selector"
import { SizeSelector } from "@/components/shop/size-selector"
import { ContactCta } from "@/components/shop/contact-cta"

/**
 * The whole `/shop/[code]` experience below the page chrome: gallery,
 * colour + size pickers, price, and the LINE/Instagram order CTA. `product`
 * is `PublicProductDetail` — the storefront-safe shape from
 * `db/queries/storefront.ts` — passed through unmodified; every field on it
 * is already safe to serialise into this Client Component's props.
 */
export function ProductDetail({
  product,
  locale,
}: {
  product: PublicProductDetail
  locale: string
}) {
  const t = useTranslations()

  const stockByColor = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const color of product.colors) {
      map[color] = product.variants.some((v) => v.color === color && v.inStock)
    }
    return map
  }, [product.colors, product.variants])

  const [selectedColor, setSelectedColor] = useState<string | null>(
    product.colors[0] ?? null
  )
  const [selectedSize, setSelectedSize] = useState<string | null>(null)

  const sizes = useMemo(() => {
    const relevant = product.variants.filter((v) =>
      selectedColor ? v.color === selectedColor : true
    )
    return [...relevant]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => ({ size: v.size, inStock: v.inStock }))
  }, [product.variants, selectedColor])

  function handleColorChange(color: string) {
    setSelectedColor(color)
    setSelectedSize(null)
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery
          images={product.images}
          selectedColor={selectedColor}
          productName={product.productName}
        />

        <div className="flex flex-col gap-5">
          <div className="space-y-2">
            {product.productType && (
              <p className="text-small font-bold text-muted-foreground uppercase">
                {product.productType}
              </p>
            )}
            <h1 className="text-h2 font-bold text-foreground">{product.productName}</h1>
            <p className="text-small text-muted-foreground">
              {t("shop.productCode")}: {product.productCode}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Price value={product.sellPrice} size="lg" />
            {!product.inStock && <SoldOutBadge />}
          </div>

          {product.description && (
            <p className="whitespace-pre-line text-body text-foreground">{product.description}</p>
          )}

          <div className="space-y-4 border-t border-border pt-5">
            {product.colors.length > 0 && selectedColor && (
              <ColorSelector
                colors={product.colors}
                stockByColor={stockByColor}
                value={selectedColor}
                onChange={handleColorChange}
              />
            )}
            <SizeSelector sizes={sizes} value={selectedSize} onChange={setSelectedSize} />
          </div>

          <ContactCta locale={locale} variant="inline" className="border-t border-border pt-5" />
        </div>
      </div>
    </div>
  )
}
