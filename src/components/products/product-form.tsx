"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Star, Upload, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useRouter } from "@/i18n/navigation"
import { formatBaht } from "@/lib/format"
import { buildProductImageKey, resizeProductImage } from "@/lib/image-resize"
import { productImageUrl } from "@/lib/product-image-keys"
import {
  productFormSchema,
  type ProductFormValues,
  type ProductVariantValues,
} from "@/lib/validations/product"
import type { ProductWithRelations } from "@/db/queries/products"
import type { ProductType } from "@/db/queries/product-types"
import type { Character } from "@/db/queries/characters"
import {
  createProduct,
  previewProductCode,
  updateProduct,
} from "@/app/[locale]/admin/products/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SimpleSelect } from "@/components/ui/simple-select"
import { CreatableCombobox } from "@/components/ui/creatable-combobox"
import { VariantRowsEditor } from "@/components/products/variant-rows-editor"

/** Port of carstockpro's `car-form.tsx`, wholesale where the mechanism is
 * identical (pre-row UUID upload, cover-photo star, new/existing image
 * split, `Field` sub-component) and swapped where the domain differs
 * (product fields instead of car fields; resize -> presign -> PUT instead
 * of a direct Supabase bucket upload; the variant matrix embedded at the
 * bottom instead of a notes-only tail section). See plan §7 and §12. */

type PreviewImage = {
  /** Existing image id — set only for a row loaded from the product being
   * edited, never for a newly uploaded one. */
  id?: string
  url: string
  storageKey: string
  isNew: boolean
}

type PresignResponse = { uploads: { key: string; url: string }[] }

/**
 * Resizes one picked file into its WebP renditions, asks the owner-gated
 * presign endpoint for PUT URLs at the exact keys it computed, and PUTs
 * each rendition straight to S3-compatible storage. Runs entirely client-side except for the
 * one presign round-trip — the file itself never touches this app's
 * server (plan §7).
 */
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

  // The canonical stored URL is the widest rendition — lib/image-loader.ts
  // derives every other size from it by swapping the trailing
  // `-<width>.webp` suffix, so any one of the three would work as the
  // "master" key; the widest gives the detail-view zoom the most to work
  // with.
  const widestKey = keys[keys.length - 1]
  return { url: productImageUrl(widestKey), storageKey: widestKey }
}

export function ProductForm({
  product,
  types,
  characters,
}: {
  product?: ProductWithRelations
  types: ProductType[]
  characters: Character[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const isEdit = !!product

  const [productId] = useState(() => product?.id ?? crypto.randomUUID())
  const [images, setImages] = useState<PreviewImage[]>(
    () =>
      product?.images.map((img) => ({
        id: img.id,
        url: img.url,
        storageKey: img.storageKey ?? "",
        isNew: false,
      })) ?? []
  )
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      productCode: product?.productCode ?? "",
      productName: product?.productName ?? "",
      productType: product?.productType ?? "",
      description: product?.description ?? "",
      sellPrice: product ? Number(product.sellPrice) : 0,
      originalPrice: product ? Number(product.originalPrice) : 0,
      buyingSource: product?.buyingSource ?? "",
      sourceLink: product?.sourceLink ?? "",
      preorderMinDays: product?.preorderMinDays ?? "",
      preorderMaxDays: product?.preorderMaxDays ?? "",
      characterIds: product?.characters.map((character) => character.id) ?? [],
      status: product?.status ?? "active",
      variants:
        product?.variants.map((v) => ({
          id: v.id,
          color: v.color,
          size: v.size,
          quantity: v.quantity,
          sortOrder: v.sortOrder,
        })) ?? [],
    },
  })

  const typeOptions = useMemo(() => types.map((pt) => pt.name), [types])
  const selectedType = watch("productType") ?? ""
  const selectedCharacterIds = watch("characterIds") ?? []

  /**
   * The product code is generated from the type, never typed (see
   * lib/product-code.ts). On create this holds a PREVIEW fetched whenever
   * the type changes; the server mints the real code on save. On edit it
   * is the product's existing code, which never changes — not even when
   * the type does, because the code is the storefront URL and is
   * snapshotted onto every order line.
   */
  const [codePreview, setCodePreview] = useState(product?.productCode ?? "")
  const [codeLoading, setCodeLoading] = useState(false)

  useEffect(() => {
    if (isEdit) return
    const type = selectedType.trim()
    if (!type) {
      setCodePreview("")
      setValue("productCode", "", { shouldValidate: false })
      return
    }

    let cancelled = false
    setCodeLoading(true)
    previewProductCode(type)
      .then((result) => {
        if (cancelled) return
        const code = result.ok ? (result.code ?? "") : ""
        setCodePreview(code)
        // Kept in the form only to satisfy the schema — createProduct
        // ignores it and generates its own.
        setValue("productCode", code, { shouldValidate: true })
      })
      .finally(() => {
        if (!cancelled) setCodeLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedType, isEdit, setValue])

  /** Nothing but the type is editable until a type is chosen — the code,
   *  and therefore the product's identity, depends on it. */
  const awaitingType = !isEdit && !selectedType.trim()
  const selectedStatus = watch("status") ?? "active"
  const variants: ProductVariantValues[] = watch("variants") ?? []
  const sellPrice = watch("sellPrice")
  const originalPrice = watch("originalPrice")
  const marginPreview = Number(sellPrice || 0) - Number(originalPrice || 0)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      const start = images.length
      const uploaded = await Promise.all(
        Array.from(files).map((file, i) => uploadProductImage(productId, file, start + i))
      )
      setImages((prev) => [...prev, ...uploaded.map((u) => ({ ...u, isNew: true }))])
    } catch (error) {
      toast.error(t("errors.generic"))
      console.error(error)
    } finally {
      setUploading(false)
    }
  }

  function handleRemoveImage(img: PreviewImage) {
    setImages((prev) => prev.filter((i) => i !== img))
    if (img.id) setRemovedImageIds((prev) => [...prev, img.id!])
    // A newly uploaded (not-yet-saved) image removed here is orphaned in
    // R2 — no endpoint exists for a client-initiated delete-by-key outside
    // the owner-gated presign flow, and adding one solely for this
    // same-session abandoned-upload case isn't worth the extra surface.
  }

  /** Cover = first image (sortOrder 0). Move the chosen one to the front. */
  function handleSetCover(img: PreviewImage) {
    setImages((prev) => [img, ...prev.filter((i) => i !== img)])
  }

  async function onSubmit(values: ProductFormValues) {
    setSubmitting(true)
    try {
      // sortOrder follows on-screen order (index 0 = cover). Split new vs
      // existing so the action can insert new rows and reorder existing
      // ones without re-uploading anything.
      const newImages: {
        url: string
        storageKey: string
        sortOrder: number
        alt?: string
        color?: string
      }[] = []
      const imageOrder: { id: string; sortOrder: number }[] = []
      images.forEach((img, idx) => {
        if (img.isNew) {
          newImages.push({ url: img.url, storageKey: img.storageKey, sortOrder: idx })
        } else if (img.id) {
          imageOrder.push({ id: img.id, sortOrder: idx })
        }
      })

      const result = isEdit
        ? await updateProduct(product!.id, values, newImages, removedImageIds, imageOrder)
        : await createProduct(
            values,
            images.map((img, idx) => ({
              url: img.url,
              storageKey: img.storageKey,
              sortOrder: idx,
            })),
            productId
          )

      if (!result.ok) {
        toast.error(errorMessage(result.error))
        return
      }

      toast.success(isEdit ? t("product.updated") : t("product.created"))
      router.push("/admin/products")
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  function errorMessage(code: string): string {
    if (code === "forbidden") return t("errors.forbidden")
    if (code === "unauthorized") return t("errors.unauthorized")
    if (code === "duplicate_code") return t("errors.duplicateCode")
    if (code === "invalid") return t("errors.invalid")
    if (code === "not_found") return t("errors.notFound")
    return t("errors.generic")
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit, () => toast.error(t("errors.invalid")))}
      className="space-y-6"
    >
      {/* Images */}
      <section className="space-y-3 border border-border bg-card p-4">
        <Label>{t("product.images")}</Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((img) => {
            const isCover = images[0] === img
            return (
              <div
                key={img.storageKey || img.url}
                className="relative aspect-square overflow-hidden bg-muted"
              >
                <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
                <button
                  type="button"
                  onClick={() => handleSetCover(img)}
                  disabled={isCover}
                  aria-label={t("product.setCover")}
                  title={isCover ? t("product.cover") : t("product.setCover")}
                  className={cn(
                    "absolute top-1 left-1 flex size-6 items-center justify-center",
                    isCover
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/80 text-foreground"
                  )}
                >
                  <Star className={cn("size-3.5", isCover && "fill-current")} />
                </button>
                {isCover && (
                  <span className="absolute bottom-1 left-1 bg-primary px-1.5 py-0.5 text-small font-bold text-primary-foreground">
                    {t("product.cover")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveImage(img)}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center bg-background/80"
                  aria-label={t("common.delete")}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })}

          <label
            className={cn(
              "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-input text-small text-muted-foreground hover:bg-muted",
              (uploading || awaitingType) && "pointer-events-none opacity-60"
            )}
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Upload className="size-5" />
            )}
            <span>{t("product.addImages")}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        </div>
      </section>

      {/* Fields */}
      <section className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-2">
        <Field label={t("product.type")} required>
          <CreatableCombobox
            value={selectedType}
            onValueChange={(v) => setValue("productType", v, { shouldValidate: true })}
            options={typeOptions}
            placeholder={t("common.search")}
            createLabel={(q) => t("product.addOption", { value: q })}
          />
        </Field>
        <Field label={t("product.code")} hint={t("product.codeAuto")}>
          <Input
            value={codeLoading ? t("common.loading") : codePreview}
            readOnly
            disabled
            placeholder={t("product.codeAwaitingType")}
            aria-describedby="product-code-hint"
          />
        </Field>
        <Field label={t("product.name")} error={errors.productName && t("common.required")} required>
          <Input disabled={awaitingType} {...register("productName")} />
        </Field>
        <Field label={t("product.status")}>
          <SimpleSelect
            disabled={awaitingType}
            value={selectedStatus}
            onValueChange={(v) =>
              setValue("status", v as ProductFormValues["status"], { shouldValidate: true })
            }
            options={[
              { value: "draft", label: t("product.statusDraft") },
              { value: "active", label: t("product.statusActive") },
              { value: "archived", label: t("product.statusArchived") },
            ]}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("product.description")}>
            <Textarea rows={3} disabled={awaitingType} {...register("description")} />
          </Field>
        </div>
        <Field
          label={t("product.preorderMinDays")}
          error={errors.preorderMinDays && t("errors.invalid")}
        >
          <Input type="number" inputMode="numeric" min={1} max={3650} {...register("preorderMinDays")} />
        </Field>
        <Field
          label={t("product.preorderMaxDays")}
          error={errors.preorderMaxDays && t("errors.invalid")}
        >
          <Input type="number" inputMode="numeric" min={1} max={3650} {...register("preorderMaxDays")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("product.characters")} hint={t("product.charactersHint")}>
            <div className="flex flex-wrap gap-2">
              {characters.length === 0 ? (
                <span className="text-small text-muted-foreground">{t("product.noCharacters")}</span>
              ) : characters.map((character) => {
                const selected = selectedCharacterIds.includes(character.id)
                return (
                  <Button
                    key={character.id}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    onClick={() => setValue(
                      "characterIds",
                      selected
                        ? selectedCharacterIds.filter((id) => id !== character.id)
                        : [...selectedCharacterIds, character.id],
                      { shouldValidate: true, shouldDirty: true }
                    )}
                  >
                    {character.name}{character.nameEn ? ` / ${character.nameEn}` : ""}
                  </Button>
                )
              })}
            </div>
          </Field>
        </div>
      </section>

      {/* Costs — owner-only fields. Unlike carstockpro's CarForm (which
          gates these behind `showFinancials` for its sales role), every
          admin surface here is owner-only already (plan §1: two-role
          enum, staff has zero v1 capability), so there is no non-owner
          variant of this form to hide them from. */}
      <section className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-2">
        <Field label={t("product.sellPrice")}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            disabled={awaitingType}
            {...register("sellPrice")}
          />
        </Field>
        <Field label={t("product.originalPrice")}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            disabled={awaitingType}
            {...register("originalPrice")}
          />
        </Field>
        <Field label={t("product.buyingSource")}>
          <Input disabled={awaitingType} {...register("buyingSource")} />
        </Field>
        <Field
          label={t("product.sourceLink")}
          error={errors.sourceLink && t("errors.invalid")}
        >
          <Input type="url" placeholder="https://" disabled={awaitingType} {...register("sourceLink")} />
        </Field>
        <div className="flex items-center justify-between bg-accent px-4 py-3 text-accent-foreground sm:col-span-2">
          <span className="text-body font-medium">{t("product.margin")}</span>
          <span className="text-h4 font-bold">{formatBaht(marginPreview)}</span>
        </div>
      </section>

      {/* Variants */}
      <div>
        <VariantRowsEditor
          value={variants}
          disabled={awaitingType}
          onChange={(next) => setValue("variants", next, { shouldValidate: true })}
        />
        {errors.variants?.message && (
          <p className="mt-2 text-body text-destructive">{t("errors.duplicateVariant")}</p>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => router.back()}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          size="lg"
          className="flex-1"
          disabled={submitting || uploading || awaitingType}
        >
          {submitting && <Loader2 className="animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  error,
  required,
  hint,
  children,
}: {
  label: string
  error?: string | boolean
  required?: boolean
  /** Explanatory note under the input — e.g. why a field is read-only. */
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-body">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && (
        <p id="product-code-hint" className="text-small text-muted-foreground">
          {hint}
        </p>
      )}
      {typeof error === "string" && error && <p className="text-small text-destructive">{error}</p>}
    </div>
  )
}
