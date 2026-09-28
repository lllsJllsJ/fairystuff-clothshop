"use client"

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { toEnglishColor } from "@/lib/colors"
import type { ProductAudience } from "@/lib/product-taxonomy"
import { MAX_SIZE_LENGTH, normalizeSizes, sizePresetsFor, sortSizes } from "@/lib/sizes"
import type { ProductVariantValues } from "@/lib/validations/product"
import { Button } from "@/components/ui/button"
import { CreatableCombobox } from "@/components/ui/creatable-combobox"
import { Input } from "@/components/ui/input"

/**
 * "Sizes & availability" — the preorder shop's replacement for a stock
 * matrix. There are no quantities: the owner picks which sizes the product
 * comes in (preset chips for the audience, or any free-text size), which
 * colours, and then flips each colour x size ON (orderable) or OFF.
 *
 * ---------------------------------------------------------------------
 * WHY "OFF" KEEPS THE ROW
 * ---------------------------------------------------------------------
 * Turning a cell off only sets `isAvailable = false`; the variant row and
 * its id survive. Carts in customers' browsers and
 * `order_items.productVariantId` point at that id, so flipping a size off
 * for a week and back on never breaks either. Only deselecting a whole
 * size or removing a colour deletes rows.
 */

/** "-" is the one-colour sentinel — see productVariants.color in schema.ts. */
const NO_COLOR = "-"

function uniqueInOrder(values: string[]): string[] {
  return Array.from(new Set(values))
}

function sameSize(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Rebuilds the flat variants array: colours in order, sizes sorted
 * presets-first, sortOrder = position. Keeps each existing row's id. */
function build(
  colors: string[],
  sizes: string[],
  lookup: (color: string, size: string) => ProductVariantValues | undefined,
  fillMissing: boolean
): ProductVariantValues[] {
  const out: ProductVariantValues[] = []
  for (const color of colors) {
    for (const size of sortSizes(sizes)) {
      const existing = lookup(color, size)
      if (!existing && !fillMissing) continue
      out.push({
        ...(existing ?? { isAvailable: true }),
        color,
        size,
        sortOrder: out.length,
      })
    }
  }
  return out
}

export function VariantRowsEditor({
  value,
  onChange,
  audience,
  palette,
}: {
  value: ProductVariantValues[]
  onChange: (variants: ProductVariantValues[]) => void
  audience: ProductAudience
  /** Settings' colour palette, in order — the dropdown options and what
   * "Add colour" picks from. Anything typed instead is kept verbatim and
   * joins the palette when the product is saved (learnProductColors). */
  palette: string[]
}) {
  const t = useTranslations("variant")
  const tProduct = useTranslations("product")
  /** Colours added before any size exists have no rows yet — held here so
   * they don't vanish. Cleared as soon as rows carry them. */
  const [pendingColors, setPendingColors] = useState<string[]>([])
  /** The free-text size being typed. */
  const [customSize, setCustomSize] = useState("")

  const rowColors = uniqueInOrder(value.map((v) => v.color))
  const colors = uniqueInOrder([...rowColors, ...pendingColors])
  const sizes = sortSizes(uniqueInOrder(value.map((v) => v.size)))
  const presets = sizePresetsFor(audience)
  const extraSizes = sizes.filter((size) => !presets.some((p) => sameSize(p, size)))

  const lookup = (color: string, size: string) =>
    value.find((v) => v.color === color && sameSize(v.size, size))

  /** Colours that rows get created for: real ones, else the "-" sentinel. */
  const targetColors = colors.length > 0 ? colors : [NO_COLOR]

  /**
   * Rebuilds rows for `nextColors` x `nextSizes`. Existing cells keep their
   * row (id + on/off); a cell for which `isNew` is true is created ON; any
   * other missing cell stays missing — so adding a size never silently
   * switches on a gap an older, sparse product already had.
   */
  function emit(
    nextColors: string[],
    nextSizes: string[],
    isNew: (color: string, size: string) => boolean = () => false
  ) {
    const effective = nextColors.length > 0 ? nextColors : nextSizes.length > 0 ? [NO_COLOR] : []
    onChange(
      build(
        effective,
        nextSizes,
        (c, s) => lookup(c, s) ?? (isNew(c, s) ? { color: c, size: s, isAvailable: true, sortOrder: 0 } : undefined),
        false
      )
    )
    setPendingColors((prev) => prev.filter((c) => !effective.includes(c)))
  }

  function addSize(size: string) {
    if (sizes.some((s) => sameSize(s, size))) return
    emit(targetColors, [...sizes, size], (_, s) => sameSize(s, size))
  }

  function toggleSize(size: string) {
    if (sizes.some((s) => sameSize(s, size))) {
      emit(targetColors, sizes.filter((s) => !sameSize(s, size)))
    } else {
      addSize(size)
    }
  }

  function addCustomSize() {
    const [size] = normalizeSizes([customSize])
    setCustomSize("")
    if (size) addSize(size)
  }

  function addColor() {
    const used = new Set(colors)
    const name =
      palette.find((preset) => !used.has(preset)) ?? `Colour ${colors.length + 1}`
    if (colors.length === 1 && colors[0] === NO_COLOR) {
      // Going from "one colour" to named colours: the existing rows become
      // the first named colour instead of leaving a "-" block behind.
      renameColor(NO_COLOR, name)
      return
    }
    if (sizes.length === 0) {
      setPendingColors((prev) => [...prev, name])
      return
    }
    emit([...colors, name], sizes, (c) => c === name)
  }

  /** Returns false when the rename is refused (blank, or would merge two
   * colours) — the cell then snaps back to the current name. */
  function renameColor(from: string, raw: string): boolean {
    const trimmed = raw.trim()
    if (!trimmed) return false
    // Colours are English-only: "ขาว" becomes "White", and "black" takes
    // the palette's spelling "Black" (lib/colors.ts).
    const to = trimmed === t("noColorLabel") ? NO_COLOR : toEnglishColor(trimmed, palette)
    if (to === from) return true
    if (colors.includes(to)) return false // would merge two colours
    setPendingColors((prev) => prev.map((c) => (c === from ? to : c)))
    onChange(value.map((v) => (v.color === from ? { ...v, color: to } : v)))
    return true
  }

  function removeColor(color: string) {
    setPendingColors((prev) => prev.filter((c) => c !== color))
    const remaining = colors.filter((c) => c !== color)
    if (remaining.length === 0 && sizes.length > 0) {
      // Last colour gone but sizes still chosen: keep them as one-colour.
      onChange(
        sortSizes(sizes).map((size, i) => ({
          ...(lookup(color, size) ?? { isAvailable: true }),
          color: NO_COLOR,
          size,
          sortOrder: i,
        }))
      )
      return
    }
    emit(remaining, sizes)
  }

  function toggleCell(color: string, size: string) {
    const existing = lookup(color, size)
    if (existing) {
      onChange(value.map((v) => (v === existing ? { ...v, isAvailable: !v.isAvailable } : v)))
    } else {
      onChange(
        build(colors, sizes, (c, s) =>
          c === color && sameSize(s, size)
            ? { color, size, isAvailable: true, sortOrder: 0 }
            : lookup(c, s),
          false
        )
      )
    }
  }

  function setAll(isAvailable: boolean) {
    onChange(build(targetColors, sizes, lookup, true).map((v) => ({ ...v, isAvailable })))
  }

  const displayColor = (color: string) => (color === NO_COLOR ? t("noColorLabel") : color)
  // The palette first, then any colour this product has that isn't in it
  // yet (typed here, or from before the palette existed).
  const colorOptions = [
    t("noColorLabel"),
    ...uniqueInOrder([...palette, ...colors.filter((c) => c !== NO_COLOR)]),
  ]
  const available = value.filter((v) => v.isAvailable !== false).length

  return (
    <section className="space-y-5 border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-subtitle font-bold">{t("title")}</h2>
        {value.length > 0 && (
          <p className="text-small text-muted-foreground">
            {t("availableCount", { available, total: value.length })}
          </p>
        )}
      </div>

      {/* 1. Sizes */}
      <div className="space-y-2">
        <p className="text-body font-medium">
          {audience === "kids" ? t("sizesKids") : audience === "both" ? t("sizesBoth") : t("sizesAdult")}
        </p>
        <div className="flex flex-wrap gap-2">
          {[...presets, ...extraSizes].map((size) => {
            const selected = sizes.some((s) => sameSize(s, size))
            const isCustom = !presets.some((p) => sameSize(p, size))
            return (
              <button
                key={size}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleSize(size)}
                className={cn(
                  "inline-flex h-9 min-w-11 items-center justify-center gap-1 rounded-full border px-3 text-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:border-primary",
                  isCustom && !selected && "border-dashed"
                )}
              >
                {selected && <Check className="size-3.5" />}
                {size}
                {isCustom && selected && <X className="size-3.5 opacity-80" aria-hidden />}
              </button>
            )
          })}
          <div className="flex items-center gap-1">
            <Input
              value={customSize}
              maxLength={MAX_SIZE_LENGTH}
              onChange={(e) => setCustomSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addCustomSize()
                }
              }}
              placeholder={t("customSizePlaceholder")}
              aria-label={t("customSize")}
              className="h-9 w-40 rounded-full"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full"
              disabled={!customSize.trim()}
              onClick={addCustomSize}
            >
              <Plus />
              {t("customSize")}
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Colours + availability grid */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body font-medium">{t("availability")}</p>
          <div className="flex flex-wrap gap-2">
            {sizes.length > 0 && (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAll(true)}>
                  {t("enableAll")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAll(false)}>
                  {t("disableAll")}
                </Button>
              </>
            )}
            <Button type="button" variant="outline" size="sm" onClick={addColor}>
              <Plus />
              {t("addColor")}
            </Button>
          </div>
        </div>

        {sizes.length === 0 && colors.length === 0 ? (
          <p className="rounded-md bg-muted/50 py-6 text-center text-small text-muted-foreground">
            {t("pickSizesFirst")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-max border-separate border-spacing-1">
              <thead>
                <tr className="text-small text-muted-foreground">
                  <th className="text-left font-medium">{t("color")}</th>
                  {sizes.map((size) => (
                    <th key={size} className="min-w-16 px-1 text-center font-medium">
                      {size}
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {(colors.length > 0 ? colors : [NO_COLOR]).map((color) => (
                  <tr key={color}>
                    <td className="w-44">
                      <ColorNameCell
                        value={displayColor(color)}
                        onCommit={(next) => renameColor(color, next)}
                        options={colorOptions}
                        placeholder={t("colorPlaceholder")}
                        createLabel={(query) => tProduct("addOption", { value: query })}
                      />
                    </td>
                    {sizes.map((size) => {
                      const row = lookup(color, size)
                      const on = !!row && row.isAvailable !== false
                      return (
                        <td key={size} className="text-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={`${displayColor(color)} ${size}`}
                            onClick={() => toggleCell(color, size)}
                            className={cn(
                              "inline-flex h-9 w-16 items-center justify-center rounded-md border text-small font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                              on
                                ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : row
                                  ? "border-input bg-muted text-muted-foreground line-through"
                                  : "border-dashed border-input text-muted-foreground"
                            )}
                          >
                            {on ? t("on") : row ? t("off") : "+"}
                          </button>
                        </td>
                      )
                    })}
                    <td className="text-center">
                      {color !== NO_COLOR && (
                        <button
                          type="button"
                          aria-label={t("removeColor")}
                          onClick={() => removeColor(color)}
                          className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-small text-muted-foreground">{t("availabilityHint")}</p>
      </div>
    </section>
  )
}

/**
 * One colour's name. Typing edits a local draft only — the rename is
 * committed when an option is picked, on Enter, or when focus leaves.
 *
 * Renaming on every keystroke (as this used to) re-keyed the row, since rows
 * are keyed by colour name: React remounted the input after the first
 * character and focus was lost, so only one letter could ever be typed.
 * Committing once also keeps a half-typed name that happens to match another
 * colour ("B" while typing "Blue" next to "B") from being refused midway.
 */
function ColorNameCell({
  value,
  onCommit,
  options,
  placeholder,
  createLabel,
}: {
  value: string
  /** Returns false if the name was refused; the draft then resets. */
  onCommit: (next: string) => boolean
  options: string[]
  placeholder: string
  createLabel: (query: string) => string
}) {
  const [draft, setDraft] = useState(value)
  /** Set once a rename lands: the row is about to remount under its new
   * key, and a late blur from this instance must not rename it again from
   * a stale closure. */
  const renamed = useRef(false)

  function commit(next: string) {
    if (renamed.current) return
    if (next.trim() === value) {
      setDraft(value)
      return
    }
    if (onCommit(next)) renamed.current = true
    else setDraft(value)
  }

  const query = draft.trim().toLowerCase()
  const hasMatch = !!query && options.some((o) => o.toLowerCase().includes(query))

  return (
    <CreatableCombobox
      value={draft}
      onValueChange={(next, reason) => {
        setDraft(next)
        if (reason === "item-press") commit(next)
      }}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          // Never submit the whole product form from here. When the list
          // shows a match, base-ui picks the highlighted one (item-press);
          // only a brand-new name is committed here.
          e.preventDefault()
          if (!hasMatch) commit(draft)
        } else if (e.key === "Escape") {
          setDraft(value)
        }
      }}
      options={options}
      placeholder={placeholder}
      createLabel={createLabel}
    />
  )
}
