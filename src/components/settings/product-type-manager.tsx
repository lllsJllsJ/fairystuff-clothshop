"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ProductType } from "@/db/queries/product-types"
import {
  createProductType,
  deleteProductType,
  renameProductType,
  reorderProductTypes,
} from "@/app/[locale]/admin/settings/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
  const [newName, setNewName] = useState("")
  const [newNameEn, setNewNameEn] = useState("")
  const [newPrefix, setNewPrefix] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editNameEn, setEditNameEn] = useState("")
  const [editPrefix, setEditPrefix] = useState("")

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

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setNewName("")
    setNewNameEn("")
    setNewPrefix("")
    run(() => createProductType(name, newNameEn.trim(), newPrefix.trim()), () =>
      toast.success(t("settings.productTypeCreated"))
    )
  }

  function startEdit(type: ProductType) {
    setEditingId(type.id)
    setEditName(type.name)
    setEditNameEn(type.nameEn ?? "")
    setEditPrefix(type.codePrefix ?? "")
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName("")
    setEditNameEn("")
    setEditPrefix("")
  }

  function handleRename() {
    if (!editingId) return
    const name = editName.trim()
    if (!name) return
    const id = editingId
    run(() => renameProductType(id, name, editNameEn.trim(), editPrefix.trim()), () => {
      toast.success(t("settings.productTypeUpdated"))
      cancelEdit()
    })
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

  return (
    <section className="max-w-2xl border border-border bg-card p-4">
      <h2 className="mb-1 text-h4 font-bold text-foreground">{t("settings.productTypes")}</h2>
      <p className="mb-4 text-small text-muted-foreground">{t("settings.subtitle")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder={t("settings.namePlaceholder")}
          className="min-w-32 flex-1"
        />
        <Input
          value={newNameEn}
          onChange={(e) => setNewNameEn(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder={t("settings.nameEnPlaceholder")}
          className="min-w-32 flex-1"
        />
        <Input
          value={newPrefix}
          onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder={t("settings.codePrefixPlaceholder")}
          aria-label={t("settings.codePrefix")}
          maxLength={6}
          className="w-24 uppercase"
        />
        <Button onClick={handleCreate} disabled={pending || !newName.trim()}>
          <Plus />
          {t("settings.addProductType")}
        </Button>
      </div>

      {types.length === 0 ? (
        <p className="py-6 text-center text-small text-muted-foreground">
          {t("settings.noProductTypes")}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {types.map((type, index) => (
            <li key={type.id} className={cn("flex items-center gap-2 py-2", pending && "opacity-70")}>
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={pending || index === 0}
                  aria-label={t("settings.moveUp")}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={pending || index === types.length - 1}
                  aria-label={t("settings.moveDown")}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>

              {editingId === type.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRename()}
                    className="min-w-28 flex-1"
                    autoFocus
                  />
                  <Input
                    value={editNameEn}
                    onChange={(e) => setEditNameEn(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRename()}
                    className="min-w-28 flex-1"
                  />
                  <Input
                    value={editPrefix}
                    onChange={(e) => setEditPrefix(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleRename()}
                    placeholder={t("settings.codePrefixPlaceholder")}
                    aria-label={t("settings.codePrefix")}
                    maxLength={6}
                    className="w-20 uppercase"
                  />
                  <Button size="icon-sm" onClick={handleRename} disabled={pending || !editName.trim()}>
                    <Check />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={cancelEdit} disabled={pending}>
                    <X />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-1 flex-col">
                    <span className="text-body font-medium text-foreground">{type.name}</span>
                    {type.nameEn && (
                      <span className="text-small text-muted-foreground">{type.nameEn}</span>
                    )}
                  </div>
                  {type.codePrefix && (
                    <span
                      title={t("settings.codePrefixHint")}
                      className="shrink-0 bg-muted px-1.5 py-0.5 font-mono text-small text-muted-foreground"
                    >
                      {type.codePrefix}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => startEdit(type)}
                    disabled={pending}
                    aria-label={t("common.edit")}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(type)}
                    disabled={pending}
                    aria-label={t("common.delete")}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
