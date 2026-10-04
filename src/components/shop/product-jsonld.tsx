import type { PublicProductDetail } from "@/db/queries/storefront"

/**
 * Product + Offer JSON-LD for a detail page. Built ONLY from
 * `PublicProductDetail` (the storefront-safe shape) — never spread the
 * object, so a private field accidentally added upstream can't ride along
 * silently; each field below is picked explicitly.
 */
export function ProductJsonLd({
  product,
  url,
  locale,
}: {
  product: PublicProductDetail
  url: string
  locale: string
}) {
  const currency = "THB"
  const json = {
    "@context": "https://schema.org",
    "@type": "Product",
    sku: product.productCode,
    name: product.productName,
    description: product.description ?? product.productName,
    category: product.characters[0]?.nameEn ?? product.characters[0]?.name ?? undefined,
    image: product.images.map((img) => img.url),
    inLanguage: locale,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: currency,
      // The price a customer pays right now (discount applied), valid until
      // the discount's end when it has one.
      price: Number(product.sellPrice).toFixed(2),
      priceValidUntil: product.discountEndsAt ? product.discountEndsAt.slice(0, 10) : undefined,
      availability:
        product.variants.length === 0 || product.variants.some((v) => v.isAvailable)
          ? "https://schema.org/PreOrder"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  )
}
