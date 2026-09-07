"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { AlertTriangle, ListRestart, RotateCcw, Trash2 } from "lucide-react"

import { CLEAR_CONFIRMATION } from "@/lib/data-confirm"
import {
  clearShopData,
  type DataToolResult,
} from "@/app/[locale]/admin/settings/actions"
import { restoreDefaultCharacters } from "@/app/[locale]/admin/settings/workflow-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * The danger zone — every tool here changes live shop data and none of them
 * are undoable.
 *
 * `clearShopData` is the heaviest, so it never fires from a single click: the
 * dialog makes the owner type a phrase (`lib/data-confirm.ts`) that the server
 * action independently re-checks — the typed text is a real gate, not
 * decoration.
 *
 * The character tools are one tier down (they only touch the taxonomy, and
 * "Restore" is purely additive), so Reset gates on a `confirm()` rather than a
 * typed phrase. Neither can detach a character from a product: the server
 * action reports those back in `skipped` instead of deleting them.
 */

export function DataTools() {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [seeding, setSeeding] = useState(false)

  const phrase = CLEAR_CONFIRMATION
  const matches = typed.trim() === phrase

  function close() {
    setOpen(false)
    setTyped("")
  }

  function seedCharacters(reset: boolean) {
    if (reset && !window.confirm(t("settings.resetCharactersConfirm"))) return
    setSeeding(true)
    startTransition(async () => {
      const result = await restoreDefaultCharacters(reset)
      if (!result.ok) {
        setSeeding(false)
        toast.error(result.error === "forbidden" ? t("errors.forbidden") : t("errors.generic"))
        return
      }
      toast.success(t("settings.charactersRestored"))
      if (result.deleted.length > 0) {
        toast.info(t("settings.charactersRemoved", { count: result.deleted.length, names: result.deleted.join(", ") }))
      }
      if (result.skipped.length > 0) {
        toast.warning(t("settings.charactersKept", { count: result.skipped.length, names: result.skipped.join(", ") }))
      }
      setSeeding(false)
      router.refresh()
    })
  }

  function handleConfirm() {
    if (!open || !matches) return

    startTransition(async () => {
      const result: DataToolResult = await clearShopData(typed.trim())

      if (!result.ok) {
        if (result.error === "confirm_mismatch") {
          toast.error(t("settings.confirmMismatch"))
        } else if (result.error === "forbidden") {
          toast.error(t("errors.forbidden"))
        } else {
          toast.error(t("errors.generic"))
        }
        return
      }

      toast.success(t("settings.dataCleared"))
      close()
      router.refresh()
    })
  }

  return (
    <section className="max-w-2xl border border-border bg-card p-4">
      <h2 className="mb-1 text-h4 font-bold text-foreground">
        {t("settings.dataTools")}
      </h2>
      <p className="mb-4 text-small text-muted-foreground">
        {t("settings.dataToolsSubtitle")}
      </p>

      <ul className="divide-y divide-border">
        <li className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-48 flex-1">
            <p className="text-small font-medium text-foreground">
              {t("settings.clearData")}
            </p>
            <p className="text-small text-muted-foreground">
              {t("settings.clearDataDescription")}
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => setOpen(true)}
            disabled={pending}
          >
            <Trash2 />
            {t("settings.clearData")}
          </Button>
        </li>

        <li className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-48 flex-1">
            <p className="text-small font-medium text-foreground">
              {t("settings.characters")}
            </p>
            <p className="text-small text-muted-foreground">
              {t("settings.seedCharactersHint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => seedCharacters(false)}
              disabled={pending || seeding}
            >
              <RotateCcw />
              {t("settings.seedCharacters")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => seedCharacters(true)}
              disabled={pending || seeding}
            >
              <ListRestart />
              {t("settings.resetCharacters")}
            </Button>
          </div>
        </li>
      </ul>

      <p className="mt-3 flex items-center gap-1.5 text-small text-destructive">
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        {t("settings.dangerZone")}
      </p>

      <Dialog
        open={open}
        onOpenChange={(open) => (open ? undefined : close())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("settings.confirmClearTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("settings.confirmClearBody")}
            </DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1.5 text-small text-foreground">
            {t("settings.confirmTypeToProceed", { phrase })}
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleConfirm()}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-label={t("settings.confirmTypeToProceed", { phrase })}
            />
          </label>

          {pending && (
            <p className="text-small text-muted-foreground">
              {t("settings.working")}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={pending || !matches}
            >
              {pending ? t("common.loading") : t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
