"use client"

import { useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Save, Upload, X } from "lucide-react"

import type { ShopSettings } from "@/db/queries/settings"
import { buildBrandLogoKey, resizeBrandLogo } from "@/lib/image-resize"
import { brandLogoUrl } from "@/lib/brand-image-keys"
import { saveBrandSettings } from "@/app/[locale]/admin/settings/workflow-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type PresignResponse = { uploads: { key: string; url: string }[] }

/**
 * Same resize -> presign -> PUT flow as ProductForm's
 * `uploadProductImage`, scoped to the `brand/logo-...` key namespace
 * instead of a per-product one (see lib/brand-image-keys.ts). Only one
 * "slot" exists, so there's no `index` and no variant matrix — just the
 * three widths of a single picked file.
 */
async function uploadBrandLogo(file: File): Promise<{ url: string; storageKey: string }> {
  const renditions = await resizeBrandLogo(file)
  const timestamp = Date.now()
  const keys = renditions.map((r) => buildBrandLogoKey(r.width, timestamp))

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

  // Widest rendition is the canonical stored key, same convention as
  // product images — lib/image-loader.ts derives every other width from it.
  const widestKey = keys[keys.length - 1]
  return { url: brandLogoUrl(widestKey), storageKey: widestKey }
}

export function BrandSettings({ settings }: { settings: ShopSettings }) {
  const t = useTranslations("settings")
  const [brandName, setBrandName] = useState(settings.brandName ?? "")
  const [descriptionTh, setDescriptionTh] = useState(settings.brandDescriptionTh ?? "")
  const [descriptionEn, setDescriptionEn] = useState(settings.brandDescriptionEn ?? "")
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? "")
  const [logoStorageKey, setLogoStorageKey] = useState(settings.logoStorageKey ?? "")
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleLogoFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadBrandLogo(file)
      setLogoUrl(uploaded.url)
      setLogoStorageKey(uploaded.storageKey)
    } catch (error) {
      toast.error(t("saveFailed"))
      console.error(error)
    } finally {
      setUploading(false)
    }
  }

  function handleRemoveLogo() {
    setLogoUrl("")
    setLogoStorageKey("")
  }

  async function handleSave() {
    setSaving(true)
    try {
      const result = await saveBrandSettings(brandName, descriptionTh, descriptionEn, logoUrl, logoStorageKey)
      if (!result.ok) toast.error(t("saveFailed"))
      else {
        toast.success(t("saved"))
        window.location.reload()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("brand")}</h2>
      <p className="mt-1 text-small text-muted-foreground">{t("brandHint")}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("brandName")}</Label>
          <Input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder={t("brandNamePlaceholder")}
            maxLength={80}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("brandDescriptionTh")}</Label>
          <Textarea
            value={descriptionTh}
            onChange={(e) => setDescriptionTh(e.target.value)}
            placeholder={t("brandDescriptionThPlaceholder")}
            maxLength={300}
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("brandDescriptionEn")}</Label>
          <Textarea
            value={descriptionEn}
            onChange={(e) => setDescriptionEn(e.target.value)}
            placeholder={t("brandDescriptionEnPlaceholder")}
            maxLength={300}
            rows={3}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("brandLogo")}</Label>
          <p className="text-small text-muted-foreground">{t("brandLogoHint")}</p>
          <div className="mt-2 flex items-center gap-4">
            {logoUrl ? (
              <div className="relative flex size-20 items-center justify-center border border-border bg-muted">
                <Image src={logoUrl} alt="" fill sizes="80px" className="object-contain p-2" />
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-destructive text-white"
                  aria-label={t("removeLogo")}
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : null}

            <label className="flex cursor-pointer items-center gap-2 border border-dashed border-border px-4 py-3 text-small text-muted-foreground hover:border-foreground hover:text-foreground">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {t("uploadLogo")}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => handleLogoFile(e.target.files)}
              />
            </label>
          </div>
        </div>
      </div>

      <Button className="mt-4" onClick={handleSave} disabled={saving || uploading}>
        <Save />
        {t("save")}
      </Button>
    </section>
  )
}
