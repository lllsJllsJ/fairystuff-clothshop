"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

const AUTOPLAY_MS = 5000
const SWIPE_THRESHOLD_PX = 40
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * Crossfading slideshow for the owner's hero photos (Admin -> Settings ->
 * Home page hero photos, max 3). Autoplays only when there's more than one
 * photo, pauses while hovered/focused, and never autoplays under
 * prefers-reduced-motion. Only opacity animates (compositor-friendly), and
 * every slide stays mounted so switching never waits on a network fetch —
 * the first one is `priority` since it's the LCP element.
 */
export function HeroCarousel({ images }: { images: string[] }) {
  const t = useTranslations("home")
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  // Server snapshot = reduced, so the prerendered page never autoplays
  // before hydration knows the real preference.
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true)
  const touchStartX = useRef<number | null>(null)
  const count = images.length

  const go = useCallback(
    (delta: number) => setActive((current) => (current + delta + count) % count),
    [count]
  )

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return
    const timer = window.setInterval(() => go(1), AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [count, paused, reducedMotion, go])

  return (
    <div
      className="group relative aspect-[4/5] w-full overflow-hidden bg-white/10 shadow-2xl"
      style={{ borderRadius: "var(--radius-promo)" }}
      role="region"
      aria-roledescription="carousel"
      aria-label={t("heroSlides")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current
        const end = e.changedTouches[0]?.clientX
        touchStartX.current = null
        if (start === null || end === undefined || count < 2) return
        const dx = end - start
        if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) go(dx < 0 ? 1 : -1)
      }}
    >
      {images.map((src, index) => (
        <div
          key={src}
          role="group"
          aria-roledescription="slide"
          aria-label={t("heroSlide", { n: index + 1, total: count })}
          aria-hidden={index !== active}
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none",
            index === active ? "opacity-100" : "opacity-0"
          )}
        >
          <Image
            src={src}
            alt=""
            fill
            priority={index === 0}
            sizes="(min-width: 1024px) 560px, 100vw"
            className="object-cover"
          />
        </div>
      ))}

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={t("heroPrev")}
            className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-primary opacity-100 shadow transition-opacity hover:bg-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white lg:opacity-0 lg:group-hover:opacity-100"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={t("heroNext")}
            className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-primary opacity-100 shadow transition-opacity hover:bg-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white lg:opacity-0 lg:group-hover:opacity-100"
          >
            <ChevronRight className="size-5" />
          </button>

          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
            {images.map((src, index) => (
              <button
                key={src}
                type="button"
                onClick={() => setActive(index)}
                aria-label={t("heroSlide", { n: index + 1, total: count })}
                aria-current={index === active}
                className={cn(
                  "size-2.5 rounded-full bg-white transition-[transform,opacity] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  index === active ? "scale-125 opacity-100" : "opacity-50 hover:opacity-90"
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
