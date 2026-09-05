"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ShoppingBag } from "lucide-react"
import { toast } from "sonner"

import type { PublicProductDetail } from "@/db/queries/storefront"
import { Price } from "@/components/shop/price"
import { ProductGallery } from "@/components/shop/product-gallery"
import { ColorSelector } from "@/components/shop/color-selector"
import { SizeSelector } from "@/components/shop/size-selector"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCart } from "@/components/cart/cart-provider"

/**
 * The whole `/shop/[code]` experience below the page chrome: gallery,
 * colour + size pickers, price, and the add-to-cart preorder action. `product`
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
  const cart = useCart()

  const [selectedColor, setSelectedColor] = useState<string | null>(
    product.colors[0] ?? null
  )
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  const sizes = useMemo(() => {
    const relevant = product.variants.filter((v) =>
      selectedColor ? v.color === selectedColor : true
    )
    return [...relevant]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => v.size)
  }, [product.variants, selectedColor])

  function handleColorChange(color: string) {
    setSelectedColor(color)
    setSelectedSize(null)
  }

  function addToCart() {
    const variant = product.variants.find((row) =>
      row.size === selectedSize && (selectedColor ? row.color === selectedColor : true)
    )
    if (product.variants.length > 0 && !variant) {
      toast.error(t("cart.selectVariant"))
      return
    }
    cart.addItem({
      productId: product.id,
      productVariantId: variant?.id ?? null,
      productCode: product.productCode,
      productName: product.productName,
      color: variant?.color && variant.color !== "-" ? variant.color : null,
      size: variant?.size ?? null,
      sellPrice: product.sellPrice,
      imageUrl: product.images[0]?.url ?? null,
    }, quantity)
    toast.success(t("cart.added"))
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
            {product.characters.length > 0 && (
              <p className="text-small font-bold text-muted-foreground uppercase">
                {product.characters
                  .map((character) => locale === "en" ? (character.nameEn ?? character.name) : character.name)
                  .join(" · ")}
              </p>
            )}
            <h1 className="text-h2 font-bold text-foreground">{product.productName}</h1>
            <p className="text-small text-muted-foreground">
              {t("shop.productCode")}: {product.productCode}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Price value={product.sellPrice} size="lg" />
          </div>

          {product.description && (
            <p className="whitespace-pre-line text-body text-foreground">{product.description}</p>
          )}

          <div className="space-y-4 border-t border-border pt-5">
            {product.colors.length > 0 && selectedColor && (
              <ColorSelector
                colors={product.colors}
                stockByColor={Object.fromEntries(product.colors.map((color) => [color, true]))}
                value={selectedColor}
                onChange={handleColorChange}
              />
            )}
            <SizeSelector sizes={sizes} value={selectedSize} onChange={setSelectedSize} />
          </div>
          <div className="flex gap-3 border-t border-border pt-5">
            <Input
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))}
              aria-label={t("cart.quantity")}
              className="w-24"
            />
            <Button size="lg" className="flex-1" onClick={addToCart}>
              <ShoppingBag />
              {t("cart.addToCart")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
