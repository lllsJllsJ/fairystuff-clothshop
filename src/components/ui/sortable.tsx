"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

import { cn } from "@/lib/utils"

/** Pixels the pointer must travel before a press on the handle becomes a
 * drag — keeps a tap on the handle from picking the row up. */
const DRAG_ACTIVATION_DISTANCE = 4

/**
 * Vertical drag-and-drop list (dnd-kit), shared by every reorderable admin
 * list. Controlled: `ids` is the current order and `onReorder` receives the
 * new one after a drop — the caller owns the state and decides whether that
 * means "save now" or "wait for Save".
 *
 * Mouse and touch drag from the row's `SortableHandle`; with the handle
 * focused, Space picks the row up, the arrow keys move it, Space drops it.
 * `id` must be unique per list on a page (it keys dnd-kit's ARIA ids, and a
 * stable value keeps server and client markup identical).
 */
export function SortableList({
  id,
  ids,
  onReorder,
  children,
}: {
  id: string
  ids: string[]
  onReorder: (nextIds: string[]) => void
  children: React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to))
  }

  return (
    <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

type SortableRow = ReturnType<typeof useSortable>

export type SortableHandleProps = Pick<SortableRow, "attributes" | "listeners" | "setActivatorNodeRef">

/**
 * Wires one row into the surrounding `SortableList`. Spread `rowProps` on
 * the row element and pass `handleProps` to its `SortableHandle`.
 */
export function useSortableRow(id: string, disabled = false) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled })

  return {
    isDragging,
    rowProps: {
      ref: setNodeRef,
      style: { transform: CSS.Transform.toString(transform), transition },
    },
    handleProps: { attributes, listeners, setActivatorNodeRef } satisfies SortableHandleProps,
  }
}

/** Lifted look for the row being dragged — add to the row's className. */
export const SORTABLE_DRAGGING_CLASS = "relative z-10 bg-card shadow-[var(--shadow-raised-md)]"

/** The grip a row is dragged by. `label` names the row for screen readers. */
export function SortableHandle({
  handleProps: { attributes, listeners, setActivatorNodeRef },
  label,
  disabled = false,
  className,
}: {
  handleProps: SortableHandleProps
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={label}
      // touch-none: a finger on the grip drags the row instead of scrolling
      // the page. Only the grip — the rest of the list still scrolls.
      className={cn(
        "flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing disabled:cursor-default disabled:opacity-30",
        className
      )}
    >
      <GripVertical className="size-5" aria-hidden />
    </button>
  )
}
