"use client"

import { Autocomplete } from "@base-ui/react/autocomplete"
import { ChevronDownIcon, PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A searchable dropdown whose value is free text: the user can pick a known
 * option or type a brand/model/trim that isn't in the managed list yet. The
 * typed value is kept verbatim — callers persist new entries on save.
 *
 * FILTERING: base-ui's Autocomplete has no separate "committed value" — the
 * input's text IS the query, and `mode: "list"` (the default) filters the
 * list by it. Left alone, that means reopening the dropdown on an already
 * chosen option shows only that one option, and the only way to see the
 * others is to delete the text first. `matchesQuery` below treats a query
 * that exactly equals one of the options as a selection rather than a
 * search, and shows the full list; anything else still narrows as you type.
 */
export function CreatableCombobox({
  value,
  onValueChange,
  options,
  placeholder,
  createLabel,
  className,
  disabled,
  id,
  autoFocus,
  onBlur,
  onKeyDown,
}: {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  placeholder?: string
  /** Rendered when the query matches nothing, e.g. `Add "Hilux Champ"`. */
  createLabel?: (query: string) => string
  className?: string
  disabled?: boolean
  id?: string
  /** Focus the input on mount — used when the combobox opens a table cell. */
  autoFocus?: boolean
  /** Fires when focus leaves the input. Selecting an item does NOT blur it
   *  (base-ui keeps focus), so a commit-on-blur caller only fires on real exit. */
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <Autocomplete.Root
      items={options}
      value={value}
      onValueChange={(v) => onValueChange(v)}
      disabled={disabled}
      filter={matchesQuery(options)}
      openOnInputClick
      autoHighlight
    >
      <div className="relative">
        <Autocomplete.Input
          id={id}
          autoFocus={autoFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn(
            "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
            className
          )}
        />
        <Autocomplete.Trigger
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground outline-none disabled:opacity-50"
          aria-label={placeholder}
        >
          <ChevronDownIcon className="size-4" />
        </Autocomplete.Trigger>
      </div>

      <Autocomplete.Portal>
        <Autocomplete.Positioner className="isolate z-50 outline-none" sideOffset={4}>
          <Autocomplete.Popup className="max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Autocomplete.Empty className="flex items-center gap-1.5 px-2.5 py-2 text-sm text-muted-foreground empty:p-0">
              {createLabel && value.trim() ? (
                <>
                  <PlusIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{createLabel(value.trim())}</span>
                </>
              ) : null}
            </Autocomplete.Empty>

            <Autocomplete.List className="overflow-y-auto p-1 outline-0 data-empty:p-0">
              {(option: string) => (
                <Autocomplete.Item
                  key={option}
                  value={option}
                  className="relative flex w-full cursor-default items-center rounded-md px-1.5 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {option}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  )
}

/**
 * Show everything when the query is empty or is itself one of the options
 * (i.e. the current selection); otherwise plain case-insensitive substring
 * matching. Curried over `options` so the identity only changes when the
 * option list does.
 */
function matchesQuery(options: string[]) {
  return (option: string, query: string): boolean => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return true
    if (options.some((candidate) => candidate.toLowerCase() === trimmed)) {
      return true
    }
    return option.toLowerCase().includes(trimmed)
  }
}
