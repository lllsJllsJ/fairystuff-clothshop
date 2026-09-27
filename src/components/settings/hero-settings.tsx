"use client"

import { useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Loader2, Save, Upload, X } from "lucide-react"

import type { ShopSettings } from "@/db/queries/settings"
import { buildHeroImageKey, resizeHeroImage } from "@/lib/image-resize"
import { MAX_HERO_IMAGES, heroImageUrl } from "@/lib/brand-image-keys"
import { saveHeroImages } from "@/app/[locale]/admin/settings/workflow-actions"
import { Button } from "@/components/ui/button"

type PresignResponse = { uploads: { key: string; url: string }[] }

/**
 * Same resize -> presign -> PUT flow as BrandSettings' logo upload, under
 * the `brand/hero-...` key namespace. Returns the canonical (widest) key;
 * the URL is always derived from it with heroImageUrl().
 */
async function uploadHeroImage(file: File, timestamp: number): Promise<string> {
  const renditions = await resizeHeroImage(file)
  const keys = renditions.map((r) => buildHeroImageKey(r.width, timestamp))

  const presignRes = await fetch("/api/uploads/presign-logo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
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

  return keys[keys.length - 1]
}

export function HeroSettings({ settings }: { settings: ShopSettings }) {
  const t = useTranslations("settings")
  const [keys, setKeys] = useState<string[]>(settings.heroImageKeys)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const remaining = MAX_HERO_IMAGES - keys.length

  async function handleFiles(files: FileList | null) {
    const picked = Array.from(files ?? []).slice(0, remaining)
    if (!picked.length) return
    setUploading(true)
    try {
      // Sequential, with a distinct timestamp per photo, so two photos
      // picked together can never share a storage key.
      const base = Date.now()
      for (const [i, file] of picked.entries()) {
        const key = await uploadHeroImage(file, base + i)
        setKeys((current) => [...current, key])
      }
    } catch (error) {
      toast.error(t("saveFailed"))
      console.error(error)
    } finally {
      setUploading(false)
    }
  }

  function move(index: number, delta: -1 | 1) {
    setKeys((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function remove(index: number) {
    setKeys((current) => current.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const result = await saveHeroImages(keys)
      if (!result.ok) toast.error(t("saveFailed"))
      else toast.success(t("saved"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("heroImages")}</h2>
      <p className="mt-1 text-small text-muted-foreground">
        {t("heroImagesHint", { max: MAX_HERO_IMAGES })}
      </p>
      <p className="mt-1 text-small text-muted-foreground">{t("heroImagesSizeHint")}</p>

      <ol className="mt-4 flex flex-wrap gap-4">
        {keys.map((key, index) => (
          <li key={key} className="flex w-32 flex-col gap-2">
            <div className="relative aspect-[4/5] overflow-hidden border border-border bg-muted">
              <Image
                src={heroImageUrl(key)}
                alt=""
                fill
                sizes="128px"
                className="object-cover"
              />
              <span className="absolute top-2 left-2 bg-background/90 px-2 py-0.5 text-small font-bold">
                {index + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(index)}
                className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-destructive text-white"
                aria-label={t("removeHeroImage", { n: index + 1 })}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex justify-between">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={t("moveHeroImageEarlier", { n: index + 1 })}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => move(index, 1)}
                disabled={index === keys.length - 1}
                aria-label={t("moveHeroImageLater", { n: index + 1 })}
              >
                <ChevronRight />
              </Button>
            </div>
          </li>
        ))}

        {remaining > 0 ? (
          <li className="w-32">
            <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border px-2 text-center text-small text-muted-foreground hover:border-foreground hover:text-foreground">
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
              <span>
                {t("uploadHeroImage")}
                <span className="block text-muted-foreground/80">{t("heroImagesLeft", { remaining })}</span>
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  void handleFiles(e.target.files)
                  e.target.value = ""
                }}
              />
            </label>
          </li>
        ) : null}
      </ol>

      <Button className="mt-4" onClick={handleSave} disabled={saving || uploading}>
        <Save />
        {t("save")}
      </Button>
    </section>
  )
}
