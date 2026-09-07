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
import { BackLink } from "@/components/layout/back-link"

/**
 * The sizes offered for a given colour, in the owner's configured order.
 * Module-level and pure so both the initial state and `handleColorChange`
 * call exactly the same logic — the "auto-select when there's only one"
 * rule below must never apply on first render but not on a later colour
 * switch.
 */
function sizesForColor(
  variants: PublicProductDetail["variants"],
  color: string | null
): string[] {
  return [...variants]
    .filter((v) => (color ? v.color === color : true))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => v.size)
}

/**
 * A size the customer has no choice about is not a decision worth making
 * them tap. When exactly one size exists for the current colour it is
 * pre-selected, so a one-colour/one-size product goes straight to Add to
 * cart. With two or more this returns null and lets them choose — guessing
 * would silently put the wrong size in the basket.
 */
function onlySizeFor(
  variants: PublicProductDetail["variants"],
  color: string | null
): string | null {
  const options = sizesForColor(variants, color)
  return options.length === 1 ? (options[0] ?? null) : null
}

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

  const initialColor = product.colors[0] ?? null
  const [selectedColor, setSelectedColor] = useState<string | null>(initialColor)
  const [selectedSize, setSelectedSize] = useState<string | null>(() =>
    onlySizeFor(product.variants, initialColor)
  )
  const [quantity, setQuantity] = useState(1)

  const sizes = useMemo(
    () => sizesForColor(product.variants, selectedColor),
    [product.variants, selectedColor]
  )

  function handleColorChange(color: string) {
    setSelectedColor(color)
    setSelectedSize(onlySizeFor(product.variants, color))
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
      {/* Returns to the listing the customer came from — with their
          filters, sort, page and scroll position intact — rather than a
          fixed /shop link that would silently reset all of it. Falls back
          to /shop when there is no history to go back to (a shared product
          link opened cold). */}
      <BackLink
        fallbackHref="/shop"
        label={t("cart.continueShopping")}
        className="mb-5 text-body"
      />

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
