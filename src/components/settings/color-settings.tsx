"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ArrowDown, ArrowUp } from "lucide-react"

import type { ProductColor } from "@/db/queries/product-colors"
import {
  createProductColor,
  deleteProductColor,
  reorderProductColors,
  updateProductColor,
} from "@/app/[locale]/admin/settings/workflow-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SettingsSection,
  SettingsRow,
  SettingsFormDialog,
  DialogField,
} from "@/components/settings/settings-section"

/**
 * The colour palette offered in the product editor's colour picker. Same
 * list shape as product types (add / rename / reorder / delete); the order
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

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
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

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= colors.length) return
    const ids = colors.map((c) => c.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(target, 0, moved)
    run(() => reorderProductColors(ids))
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
          colors.map((color, index) => (
            <SettingsRow
              key={color.id}
              title={color.name}
              disabled={pending}
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
                    disabled={pending || index === colors.length - 1}
                    aria-label={t("settings.moveDown")}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown />
                  </Button>
                </div>
              }
              onEdit={() => setEditing(color)}
              onDelete={() => handleDelete(color)}
              editLabel={t("common.edit")}
              deleteLabel={t("common.delete")}
            />
          ))
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
