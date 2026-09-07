"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ArrowDown, ArrowUp } from "lucide-react"

import type { ProductType } from "@/db/queries/product-types"
import {
  createProductType,
  deleteProductType,
  renameProductType,
  reorderProductTypes,
} from "@/app/[locale]/admin/settings/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SettingsSection,
  SettingsRow,
  SettingsFormDialog,
  DialogField,
} from "@/components/settings/settings-section"

/**
 * Flat single-level manager — carstockpro's `brand-manager.tsx` handles
 * three nested levels (brand -> model -> sub-model); this shop's
 * `productType` is one level, so there's no second panel, just one list
 * with add / rename / reorder / delete.
 */
export function ProductTypeManager({ types }: { types: ProductType[] }) {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function run(fn: () => Promise<{ ok: boolean; error?: string; count?: number }>, onOk?: () => void) {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        if (res.error === "in_use" && typeof res.count === "number") {
          toast.error(t("settings.deleteProductTypeInUse", { count: res.count }))
        } else if (res.error === "duplicate_type") {
          toast.error(t("settings.duplicateProductType"))
        } else if (res.error === "forbidden") {
          toast.error(t("errors.forbidden"))
        } else {
          toast.error(t("errors.generic"))
        }
        return
      }
      onOk?.()
      router.refresh()
    })
  }

  function startEdit(type: ProductType) {
    setEditingId(type.id)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function handleDelete(type: ProductType) {
    if (!confirm(t("settings.deleteProductTypeConfirm"))) return
    run(() => deleteProductType(type.id), () => toast.success(t("settings.productTypeDeleted")))
  }

  function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= types.length) return
    const orderedIds = types.map((tp) => tp.id)
    const [moved] = orderedIds.splice(index, 1)
    orderedIds.splice(targetIndex, 0, moved)
    run(() => reorderProductTypes(orderedIds), () => toast.success(t("settings.productTypesReordered")))
  }

  const editingType = types.find((tp) => tp.id === editingId) ?? null

  return (
    <>
      <SettingsSection
        title={t("settings.productTypes")}
        hint={t("settings.subtitle")}
        onAdd={() => setAdding(true)}
        addLabel={t("settings.addProductType")}
      >
        {types.length === 0 ? (
          <li className="py-6 text-center text-small text-muted-foreground">
            {t("settings.noProductTypes")}
          </li>
        ) : (
          types.map((type, index) => (
            <SettingsRow
              key={type.id}
              title={type.name}
              subtitle={[type.nameEn, type.codePrefix].filter(Boolean).join(" · ") || undefined}
              disabled={pending}
              /* Reorder arrows are this area's own control, so they ride in
                 `leading` and the pencil/bin still land where every other
                 section puts them. */
              leading={
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMove(index, -1)}
                    disabled={pending || index === 0}
                    aria-label={t("settings.moveUp")}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMove(index, 1)}
                    disabled={pending || index === types.length - 1}
                    aria-label={t("settings.moveDown")}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown />
                  </Button>
                </div>
              }
              onEdit={() => startEdit(type)}
              onDelete={() => handleDelete(type)}
              editLabel={t("common.edit")}
              deleteLabel={t("common.delete")}
            />
          ))
        )}
      </SettingsSection>

      <ProductTypeDialog
        open={adding}
        onOpenChange={setAdding}
        title={t("settings.addProductType")}
        submitLabel={t("settings.save")}
        namePlaceholder={t("settings.namePlaceholder")}
        nameEnPlaceholder={t("settings.nameEnPlaceholder")}
        prefixPlaceholder={t("settings.codePrefixPlaceholder")}
        prefixLabel={t("settings.codePrefix")}
        nameLabel={t("settings.nameTh")}
        nameEnLabel={t("settings.nameEn")}
        onSubmit={(name, nameEn, prefix) => {
          run(() => createProductType(name.trim(), nameEn.trim(), prefix.trim()), () =>
            toast.success(t("settings.productTypeCreated"))
          )
        }}
      />

      <ProductTypeDialog
        key={editingId ?? "none"}
        open={editingId !== null}
        onOpenChange={(o) => !o && cancelEdit()}
        title={t("settings.renameProductType")}
        submitLabel={t("settings.save")}
        initialName={editingType?.name}
        initialNameEn={editingType?.nameEn ?? ""}
        initialPrefix={editingType?.codePrefix ?? ""}
        namePlaceholder={t("settings.namePlaceholder")}
        nameEnPlaceholder={t("settings.nameEnPlaceholder")}
        prefixPlaceholder={t("settings.codePrefixPlaceholder")}
        prefixLabel={t("settings.codePrefix")}
        nameLabel={t("settings.nameTh")}
        nameEnLabel={t("settings.nameEn")}
        onSubmit={(name, nameEn, prefix) => {
          if (!editingId) return
          const id = editingId
          run(() => renameProductType(id, name.trim(), nameEn.trim(), prefix.trim()), () => {
            toast.success(t("settings.productTypeUpdated"))
            cancelEdit()
          })
        }}
      />
    </>
  )
}

function ProductTypeDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialName = "",
  initialNameEn = "",
  initialPrefix = "",
  nameLabel,
  nameEnLabel,
  prefixLabel,
  namePlaceholder,
  nameEnPlaceholder,
  prefixPlaceholder,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  submitLabel: string
  initialName?: string
  initialNameEn?: string
  initialPrefix?: string
  nameLabel: string
  nameEnLabel: string
  prefixLabel: string
  namePlaceholder: string
  nameEnPlaceholder: string
  prefixPlaceholder: string
  onSubmit: (name: string, nameEn: string, prefix: string) => void
}) {
  const [name, setName] = useState(initialName)
  const [nameEn, setNameEn] = useState(initialNameEn)
  const [prefix, setPrefix] = useState(initialPrefix)

  return (
    <SettingsFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      submitLabel={submitLabel}
      canSubmit={name.trim().length > 0}
      onSubmit={() => onSubmit(name, nameEn, prefix)}
    >
      <DialogField label={nameLabel}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} />
      </DialogField>
      <DialogField label={nameEnLabel}>
        <Input
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          placeholder={nameEnPlaceholder}
        />
      </DialogField>
      <DialogField label={prefixLabel}>
        <Input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          placeholder={prefixPlaceholder}
          maxLength={6}
          className="uppercase"
        />
      </DialogField>
    </SettingsFormDialog>
  )
}
