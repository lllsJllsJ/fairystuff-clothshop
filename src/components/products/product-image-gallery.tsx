"use client"

import { useRef, useState, type Dispatch, type SetStateAction } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { buildProductImageKey, resizeProductImage } from "@/lib/image-resize"
import { productImageUrl } from "@/lib/product-image-keys"

/**
 * Photo manager for the product editor. Works from the first second — it
 * needs only the product's id, which ProductForm mints client-side
 * (`crypto.randomUUID()`) before the row exists (the pre-row UUID upload
 * trick, see CLAUDE.md), so the owner can drop photos in before choosing a
 * type, kind, or anything else.
 *
 * Main photo = index 0 = `sortOrder` 0 (the cover invariant). "Set as
 * main" and the arrows only reorder the array; the form turns on-screen
 * order into sortOrder on save.
 */

export type PreviewImage = {
  /** Existing image id — set only for a row loaded from the product being
   * edited, never for a newly uploaded one. */
  id?: string
  url: string
  storageKey: string
  isNew: boolean
}

type PresignResponse = { uploads: { key: string; url: string }[] }

/** Resize -> presign -> PUT each rendition straight to object storage. The
 * file itself never touches this app's server. */
async function uploadProductImage(
  productId: string,
  file: File,
  index: number
): Promise<{ url: string; storageKey: string }> {
  const renditions = await resizeProductImage(file)
  const timestamp = Date.now()
  const keys = renditions.map((r) => buildProductImageKey(productId, index, r.width, timestamp))

  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, keys }),
  })
  if (!presignRes.ok) throw new Error("presign_failed")
  const { uploads } = (await presignRes.json()) as PresignResponse

  await Promise.all(
    uploads.map((upload, i) =>
      fetch(upload.url, {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: renditions[i].blob,
      }).then((res) => {
        if (!res.ok) throw new Error("upload_failed")
      })
    )
  )

  // The widest rendition is the canonical URL; lib/image-loader.ts derives
  // the other widths from it by swapping the `-<width>.webp` suffix.
  const widestKey = keys[keys.length - 1]
  return { url: productImageUrl(widestKey), storageKey: widestKey }
}

function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function ProductImageGallery({
  productId,
  images,
  onChange,
  onRemove,
  onUploadingChange,
}: {
  productId: string
  images: PreviewImage[]
  /** A state setter, so an upload finishing after the owner reordered or
   * removed photos appends to the CURRENT list instead of a stale one. */
  onChange: Dispatch<SetStateAction<PreviewImage[]>>
  /** Called for a removed image so the form can queue an existing row's
   * delete. */
  onRemove: (image: PreviewImage) => void
  onUploadingChange: (uploading: boolean) => void
}) {
  const t = useTranslations("product")
  const [pending, setPending] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  /** Monotonic slot index for storage keys, so two photos in one batch
   * (which can share a millisecond timestamp) never collide. */
  const nextSlot = useRef(images.length)

  async function handleFiles(fileList: FileList | File[] | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"))
    if (files.length === 0) return

    setPending((n) => n + files.length)
    onUploadingChange(true)
    const start = nextSlot.current
    nextSlot.current += files.length
    const results = await Promise.allSettled(
      files.map((file, i) => uploadProductImage(productId, file, start + i))
    )
    const uploaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
    const failed = results.length - uploaded.length

    onChange((prev) => [...prev, ...uploaded.map((u) => ({ ...u, isNew: true }))])
    setPending((n) => n - files.length)
    onUploadingChange(false)

    if (failed > 0) {
      toast.error(t("uploadPartialFailed", { failed, total: files.length }))
      for (const r of results) if (r.status === "rejected") console.error(r.reason)
    }
  }

  function remove(image: PreviewImage) {
    onChange((prev) => prev.filter((i) => i !== image))
    onRemove(image)
  }

  const [main, ...rest] = images

  return (
    <section className="space-y-3 border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-subtitle font-bold">{t("images")}</h2>
        <p className="text-small text-muted-foreground">{t("imagesHint")}</p>
      </div>
      {/* The shop shows photos in a 4:5 frame up to ~560px wide (1120px on a
          retina screen); the largest stored rendition is 1600px
          (lib/image-resize.ts), so 1600 x 2000 is the size that stays sharp. */}
      <p className="text-small text-muted-foreground">{t("imagesSizeHint")}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          "grid grid-cols-3 gap-2 transition-colors sm:grid-cols-5",
          dragOver && "outline-2 outline-dashed outline-primary outline-offset-4"
        )}
      >
        {main && (
          <figure className="relative col-span-2 row-span-2 aspect-square overflow-hidden rounded-md bg-muted ring-2 ring-primary">
            <Image src={main.url} alt="" fill sizes="(min-width: 640px) 320px, 66vw" className="object-cover" />
            <figcaption className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-small font-bold text-primary-foreground shadow">
              <Star className="size-3.5 fill-current" />
              {t("mainPhoto")}
            </figcaption>
            <RemoveButton label={t("removeImage")} onClick={() => remove(main)} />
          </figure>
        )}

        {rest.map((image, i) => {
          const index = i + 1
          return (
            <div
              key={image.storageKey || image.url}
              className="group relative aspect-square overflow-hidden rounded-md bg-muted"
            >
              <Image src={image.url} alt="" fill sizes="160px" className="object-cover" />
              <RemoveButton label={t("removeImage")} onClick={() => remove(image)} />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1">
                <IconButton
                  label={t("moveLeft")}
                  onClick={() => onChange((prev) => moveItem(prev, index, index - 1))}
                >
                  <ChevronLeft className="size-4" />
                </IconButton>
                <button
                  type="button"
                  onClick={() => onChange((prev) => moveItem(prev, index, 0))}
                  aria-label={t("setMain")}
                  title={t("setMain")}
                  className="flex size-8 items-center justify-center rounded-full bg-background/90 hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Star className="size-4" />
                </button>
                <IconButton
                  label={t("moveRight")}
                  disabled={index === images.length - 1}
                  onClick={() => onChange((prev) => moveItem(prev, index, index + 1))}
                >
                  <ChevronRight className="size-4" />
                </IconButton>
              </div>
            </div>
          )
        })}

        {Array.from({ length: pending }, (_, i) => (
          <div
            key={`pending-${i}`}
            className="flex aspect-square items-center justify-center rounded-md bg-muted"
            aria-label={t("uploading")}
          >
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ))}

        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-input p-2 text-center text-small text-muted-foreground transition-colors hover:border-primary hover:bg-muted hover:text-foreground focus-within:outline-2 focus-within:outline-primary",
            images.length === 0 ? "col-span-3 aspect-[3/1] sm:col-span-5" : "aspect-square"
          )}
        >
          <ImagePlus className="size-6" />
          <span className="font-medium">{t("addImages")}</span>
          {images.length === 0 && <span>{t("dropImages")}</span>}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              void handleFiles(e.target.files)
              e.target.value = ""
            }}
          />
        </label>
      </div>
    </section>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-background/90 hover:bg-destructive hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
    >
      <X className="size-4" />
    </button>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-full bg-background/90 hover:bg-background disabled:invisible focus-visible:outline-2 focus-visible:outline-primary"
    >
      {children}
    </button>
  )
}
