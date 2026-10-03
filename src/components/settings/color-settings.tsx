"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import type { ProductColor } from "@/db/queries/product-colors"
import {
  createProductColor,
  deleteProductColor,
  reorderProductColors,
  updateProductColor,
} from "@/app/[locale]/admin/settings/workflow-actions"
import { Input } from "@/components/ui/input"
import { SortableList } from "@/components/ui/sortable"
import {
  SettingsSection,
  SortableSettingsRow,
  SettingsFormDialog,
  DialogField,
} from "@/components/settings/settings-section"

/**
 * The colour palette offered in the product editor's colour picker. Same
 * list shape as product types (add / rename / drag to reorder / delete); the order
 * here is the dropdown order and the order "Add colour" picks from.
 *
 * A colour typed in the product editor is added here automatically on save
 * (lib/reference.ts#learnProductColors), so this page is for tidying up,
 * not a required first step.
 */
export function ColorSettings({ colors }: { colors: ProductColor[] }) {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ProductColor | null>(null)

  // A drop reorders the list at once and saves in the background; the
  // server's order replaces this as soon as the refreshed `colors` arrives.
  const [draggedOrder, setDraggedOrder] = useState<string[] | null>(null)
  const [syncedColors, setSyncedColors] = useState(colors)
  if (colors !== syncedColors) {
    setSyncedColors(colors)
    setDraggedOrder(null)
  }
  const ordered = draggedOrder
    ? draggedOrder.flatMap((id) => colors.find((c) => c.id === id) ?? [])
    : colors

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    onOk?: () => void,
    onFail?: () => void
  ) {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        onFail?.()
        if (res.error === "duplicate") toast.error(t("settings.duplicateColor"))
        else if (res.error === "forbidden") toast.error(t("errors.forbidden"))
        else toast.error(t("settings.saveFailed"))
        return
      }
      toast.success(t("settings.saved"))
      onOk?.()
      router.refresh()
    })
  }

  function handleDelete(color: ProductColor) {
    if (!confirm(t("settings.deleteColorConfirm", { name: color.name }))) return
    run(() => deleteProductColor(color.id))
  }

  function handleReorder(ids: string[]) {
    setDraggedOrder(ids)
    run(() => reorderProductColors(ids), undefined, () => setDraggedOrder(null))
  }

  return (
    <>
      <SettingsSection
        title={t("settings.colors")}
        hint={t("settings.colorsHint")}
        onAdd={() => setAdding(true)}
        addLabel={t("settings.addColor")}
      >
        {colors.length === 0 ? (
          <li className="py-6 text-center text-small text-muted-foreground">{t("settings.noColors")}</li>
        ) : (
          <SortableList
            id="product-colors"
            ids={ordered.map((color) => color.id)}
            onReorder={handleReorder}
          >
            {ordered.map((color) => (
              <SortableSettingsRow
                key={color.id}
                id={color.id}
                dragLabel={t("settings.dragHandle", { name: color.name })}
                title={color.name}
                disabled={pending}
                onEdit={() => setEditing(color)}
                onDelete={() => handleDelete(color)}
                editLabel={t("common.edit")}
                deleteLabel={t("common.delete")}
              />
            ))}
          </SortableList>
        )}
      </SettingsSection>

      <ColorDialog
        key={adding ? "adding" : "idle"}
        open={adding}
        onOpenChange={setAdding}
        title={t("settings.addColor")}
        onSubmit={(name) => run(() => createProductColor(name), () => setAdding(false))}
      />
      <ColorDialog
        key={editing?.id ?? "none"}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={t("settings.renameColor")}
        hint={t("settings.renameColorHint")}
        initialName={editing?.name}
        onSubmit={(name) => editing && run(() => updateProductColor(editing.id, name), () => setEditing(null))}
      />
    </>
  )
}

function ColorDialog({
  open,
  onOpenChange,
  title,
  hint,
  initialName = "",
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  hint?: string
  initialName?: string
  onSubmit: (name: string) => void
}) {
  const t = useTranslations("settings")
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()

  return (
    <SettingsFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      submitLabel={t("save")}
      canSubmit={trimmed.length > 0 && trimmed !== "-"}
      onSubmit={() => onSubmit(trimmed)}
    >
      <DialogField label={t("colorName")}>
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t("colorNamePlaceholder")} />
      </DialogField>
      {hint && <p className="text-small text-muted-foreground">{hint}</p>}
    </SettingsFormDialog>
  )
}
