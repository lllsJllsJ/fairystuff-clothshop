"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { ImageOff } from "lucide-react"

import { cn } from "@/lib/utils"
import type { PublicProductImage } from "@/db/queries/storefront"

const GALLERY_WIDTH_CLASS =
  "w-[clamp(240px,44svh,100%)] justify-self-center lg:w-[clamp(360px,calc(80vh-9.6rem),560px)]"

/**
 * Main image + thumbnail rail (structural port of carstockpro's
 * `car-gallery.tsx`), restyled for the storefront and extended two ways:
 *
 * 1. **Colour filtering** — when `selectedColor` is set, shows that
 *    colour's tagged images, falling back to untagged ones (DESIGN.md's
 *    colour/size interaction rule).
 * 2. **Swipe** — the viewer is a native scroll-snap track rather than a
 *    JS gesture handler, so touch swipe, trackpad, and the thumbnail rail
 *    all drive the same `scrollLeft`-derived active index — one state
 *    machine instead of three.
 *
 * **Sizing.** Both the viewer and the no-image placeholder use
 * `GALLERY_WIDTH_CLASS` so a product with no photos reserves exactly the
 * same box as one with photos. The 4:5 box is driven by *width*, so both
 * breakpoints cap the width to cap the height: `44svh` wide is `55svh`
 * tall (44 x 5/4), keeping the name, price, and pickers above the fold on
 * a phone instead of a full screen of image. `svh` — not `vh` — because
 * `vh` on mobile resolves to the URL-bar-hidden viewport, which would make
 * the image taller than the cap exactly when the bar is showing. The
 * `240px` floor keeps it sane in landscape, where `44svh` would otherwise
 * collapse to a thumbnail.
 *
 * `GalleryViewer` is keyed by the selected colour so a colour change
 * remounts it — that's what resets `active` back to 0 and the scroller
 * back to the first frame on a colour switch, with no effect and no ref
 * read during render (this project's React Compiler / `react-hooks/refs`
 * lint forbids both).
 */
export function ProductGallery({
  images,
  selectedColor,
  productName,
}: {
  images: PublicProductImage[]
  selectedColor: string | null
  productName: string
}) {
  const t = useTranslations()
  const displayImages = selectImagesForColor(images, selectedColor)

  if (displayImages.length === 0) {
    return (
      <div
        className={cn(
          "flex aspect-[4/5] flex-col items-center justify-center gap-2 bg-muted text-muted-foreground",
          GALLERY_WIDTH_CLASS
        )}
      >
        <ImageOff className="size-10" aria-hidden />
        <p className="text-body">{t("shop.noImage")}</p>
      </div>
    )
  }

  return (
    <GalleryViewer
      key={selectedColor ?? "__all__"}
      images={displayImages}
      productName={productName}
      imagesLabel={t("shop.productImages")}
    />
  )
}

function GalleryViewer({
  images,
  productName,
  imagesLabel,
}: {
  images: PublicProductImage[]
  productName: string
  imagesLabel: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  function goTo(index: number) {
    const scroller = scrollerRef.current
    const child = scroller?.children[index] as HTMLElement | undefined
    child?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })
  }

  function handleScroll() {
    const scroller = scrollerRef.current
    if (!scroller || scroller.clientWidth === 0) return
    const index = Math.round(scroller.scrollLeft / scroller.clientWidth)
    setActive((prev) => (prev === index ? prev : index))
  }

  return (
    <div className={cn("space-y-3", GALLERY_WIDTH_CLASS)}>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="group"
        aria-label={imagesLabel}
        className="flex aspect-[4/5] w-full snap-x snap-mandatory overflow-x-auto scroll-smooth bg-muted"
      >
        {images.map((image, index) => (
          <div key={image.id} className="relative h-full w-full shrink-0 snap-start">
            <Image
              src={image.url}
              alt={image.alt ?? productName}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority={index === 0}
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`${imagesLabel} ${index + 1}`}
              aria-current={index === active}
              className={cn(
                "relative size-16 shrink-0 overflow-hidden border-2 transition-colors",
                index === active ? "border-primary" : "border-transparent"
              )}
            >
              <Image src={image.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * `null` on an image means "shown for every colour" (schema.ts). When a
 * colour is picked: prefer its tagged images; if it has none, fall back to
 * the untagged set; if there is no untagged set either, show everything
 * rather than an empty gallery.
 */
function selectImagesForColor(
  images: PublicProductImage[],
  selectedColor: string | null
): PublicProductImage[] {
  if (!selectedColor) return images
  const colorImages = images.filter((img) => img.color === selectedColor)
  if (colorImages.length > 0) return colorImages
  const untagged = images.filter((img) => img.color === null)
  return untagged.length > 0 ? untagged : images
}
