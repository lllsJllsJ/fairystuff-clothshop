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
  const availability = product.inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock"

  const json = {
    "@context": "https://schema.org",
    "@type": "Product",
    sku: product.productCode,
    name: product.productName,
    description: product.description ?? product.productName,
    category: product.productType ?? undefined,
    image: product.images.map((img) => img.url),
    inLanguage: locale,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: currency,
      price: Number(product.sellPrice).toFixed(2),
      availability,
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
