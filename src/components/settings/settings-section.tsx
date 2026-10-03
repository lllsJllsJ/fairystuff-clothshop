"use client"

import { Pencil, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SORTABLE_DRAGGING_CLASS, SortableHandle, useSortableRow } from "@/components/ui/sortable"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * The shared skeleton every settings area on `/admin/settings` renders
 * through, so the areas cannot drift apart in spacing, button placement,
 * or affordance vocabulary again.
 *
 * The contract is deliberately narrow:
 *  - the header holds the title, an optional hint, and — when the list can
 *    be added to — a single icon-only `+` on the right. No label: at 320px
 *    a labelled "Add product type" button is most of the row, and every
 *    area having a differently-worded add button was the inconsistency.
 *  - rows are text, not inputs. Editing opens `SettingsFormDialog`, which
 *    is also what `+` opens, so add and edit are the same form.
 *  - actions are always pencil-then-bin, right-aligned, 44px each.
 */
export function SettingsSection({
  title,
  hint,
  onAdd,
  addLabel,
  children,
}: {
  title: string
  hint?: string
  onAdd?: () => void
  addLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-subtitle font-bold">{title}</h2>
          {hint && <p className="mt-1 text-small text-muted-foreground">{hint}</p>}
        </div>
        {onAdd && (
          <Button size="icon" onClick={onAdd} aria-label={addLabel} className="shrink-0">
            <Plus />
          </Button>
        )}
      </div>
      <ul className="mt-4 divide-y divide-border">{children}</ul>
    </section>
  )
}

/**
 * One list entry. `leading` is for an area-specific control that has to sit
 * before the label (the item-status "make default" star, a reorder grip);
 * everything after it is fixed so the pencil and bin land in the same place
 * in every section. `rowProps` is for `SortableSettingsRow` only.
 */
export function SettingsRow({
  title,
  subtitle,
  badges,
  leading,
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
  disabled = false,
  className,
  rowProps,
}: {
  title: string
  subtitle?: string
  badges?: (string | null)[]
  leading?: React.ReactNode
  onEdit?: () => void
  onDelete?: () => void
  editLabel?: string
  deleteLabel?: string
  disabled?: boolean
  className?: string
  rowProps?: Pick<React.ComponentProps<"li">, "ref" | "style">
}) {
  const shown = (badges ?? []).filter((b): b is string => !!b)
  return (
    <li
      {...rowProps}
      className={cn("flex flex-wrap items-center gap-2 py-2", disabled && "opacity-70", className)}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-foreground">{title}</p>
        {subtitle && <p className="truncate text-small text-muted-foreground">{subtitle}</p>}
        {shown.length > 0 && (
          <p className="mt-0.5 flex flex-wrap gap-1">
            {shown.map((b) => (
              <span key={b} className="bg-muted px-1.5 py-0.5 text-small text-muted-foreground">
                {b}
              </span>
            ))}
          </p>
        )}
      </div>
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          disabled={disabled}
          aria-label={editLabel}
          className="shrink-0"
        >
          <Pencil />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={disabled}
          aria-label={deleteLabel}
          className="shrink-0 text-destructive hover:bg-destructive/10"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  )
}

/**
 * A `SettingsRow` that can be dragged to reorder — render it inside a
 * `SortableList` (components/ui/sortable.tsx). The grip takes the `leading`
 * slot, so the pencil and bin stay where every other section has them.
 */
export function SortableSettingsRow({
  id,
  dragLabel,
  disabled = false,
  ...row
}: Omit<React.ComponentProps<typeof SettingsRow>, "leading" | "rowProps" | "className"> & {
  id: string
  dragLabel: string
}) {
  const { rowProps, handleProps, isDragging } = useSortableRow(id, disabled)
  return (
    <SettingsRow
      {...row}
      disabled={disabled}
      rowProps={rowProps}
      className={isDragging ? SORTABLE_DRAGGING_CLASS : undefined}
      leading={<SortableHandle handleProps={handleProps} label={dragLabel} disabled={disabled} />}
    />
  )
}

/** The one form surface for both adding and editing, in every area. */
export function SettingsFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  canSubmit,
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  submitLabel: string
  canSubmit: boolean
  onSubmit: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 px-4">{children}</div>
        <DialogFooter className="px-4 pb-4">
          <Button
            className="w-full"
            disabled={!canSubmit}
            onClick={() => {
              onSubmit()
              onOpenChange(false)
            }}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DialogField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-small font-bold text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
