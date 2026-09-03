"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { ImageOff } from "lucide-react"

import { cn } from "@/lib/utils"
import type { PublicProductImage } from "@/db/queries/storefront"

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
      <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground lg:w-[clamp(360px,calc(80vh-9.6rem),560px)] lg:justify-self-center">
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
    <div className="w-full space-y-3 lg:w-[clamp(360px,calc(80vh-9.6rem),560px)] lg:justify-self-center">
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
