"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ProductVariantValues } from "@/lib/validations/product"
import { Button } from "@/components/ui/button"
import { CreatableCombobox } from "@/components/ui/creatable-combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Stock editor: one block per colour, every size in that block, quantities
 * across. "Add colour" creates the whole block at once — all standard sizes
 * already there at 0 — so a new colourway is one click plus the numbers,
 * with no size buttons to press first.
 *
 * ---------------------------------------------------------------------
 * WHICH CELLS BECOME ROWS
 * ---------------------------------------------------------------------
 * A cell that holds a number is a variant row (0 included — that is how a
 * colour/size combination is marked sold out rather than absent, see
 * `productVariantSchema`). A cell left blank is NOT a row: opening an
 * existing product shows the standard sizes it never had as empty cells,
 * and saving without touching them leaves the product exactly as it was.
 * Typing into one creates it; clearing one back to blank removes it.
 */

/** "-" is the one-colour sentinel — see productVariants.color in schema.ts. */
const NO_COLOR = "-"

/** Offered in the colour dropdown; anything typed instead is kept verbatim. */
const COLOR_PRESETS = ["Black", "White", "Pink", "Yellow", "Grey", "Blue"]

/** The columns every colour block shows, and what "Add colour" fills with 0. */
const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "Free Size"]

type ColorGroup = {
  color: string
  /** size -> the row for that cell, for sizes that actually exist. */
  rows: Map<string, ProductVariantValues>
}

/** Groups the flat variants array by colour, preserving first-seen order. */
function toGroups(variants: ProductVariantValues[]): ColorGroup[] {
  const groups: ColorGroup[] = []
  for (const variant of variants) {
    let group = groups.find((candidate) => candidate.color === variant.color)
    if (!group) {
      group = { color: variant.color, rows: new Map() }
      groups.push(group)
    }
    group.rows.set(variant.size, variant)
  }
  return groups
}

/** Flattens back, numbering sortOrder by on-screen position. */
function toVariants(groups: ColorGroup[]): ProductVariantValues[] {
  const out: ProductVariantValues[] = []
  for (const group of groups) {
    for (const size of sizesFor(group)) {
      const row = group.rows.get(size)
      if (!row) continue
      out.push({ ...row, color: group.color, size, sortOrder: out.length })
    }
  }
  return out
}

/** Standard sizes first, then anything non-standard this colour already has. */
function sizesFor(group: ColorGroup): string[] {
  const extras = [...group.rows.keys()].filter(
    (size) => !STANDARD_SIZES.includes(size)
  )
  return [...STANDARD_SIZES, ...extras]
}

/**
 * The shared size axis: the standard sizes plus any non-standard size any
 * colour already carries. One header for the whole grid means each colour
 * is a single line — the size names are not repeated per row.
 */
function sizeColumns(groups: ColorGroup[]): string[] {
  const extras: string[] = []
  for (const group of groups) {
    for (const size of group.rows.keys()) {
      if (!STANDARD_SIZES.includes(size) && !extras.includes(size)) {
        extras.push(size)
      }
    }
  }
  return [...STANDARD_SIZES, ...extras]
}

export function VariantRowsEditor({
  value,
  onChange,
  disabled,
}: {
  value: ProductVariantValues[]
  onChange: (variants: ProductVariantValues[]) => void
  disabled?: boolean
}) {
  const t = useTranslations()
  const [duplicateColor, setDuplicateColor] = useState(false)
  const groups = toGroups(value)
  const columns = sizeColumns(groups)

  function commit(next: ColorGroup[]) {
    const colors = next.map((group) => group.color.trim().toLowerCase())
    setDuplicateColor(new Set(colors).size !== colors.length)
    onChange(toVariants(next))
  }

  function addColorBlock() {
    const rows = new Map<string, ProductVariantValues>()
    for (const size of STANDARD_SIZES) {
      rows.set(size, { color: NO_COLOR, size, quantity: 0, sortOrder: 0 })
    }
    commit([...groups, { color: unusedColor(groups), rows }])
  }

  function renameColor(index: number, color: string) {
    commit(groups.map((group, i) => (i === index ? { ...group, color } : group)))
  }

  function removeColorBlock(index: number) {
    commit(groups.filter((_, i) => i !== index))
  }

  function setQuantity(index: number, size: string, raw: string) {
    const next = groups.map((group, i) => {
      if (i !== index) return group
      const rows = new Map(group.rows)
      if (raw === "") {
        rows.delete(size)
      } else {
        const existing = rows.get(size)
        rows.set(size, {
          ...(existing ?? { color: group.color, size, sortOrder: 0 }),
          color: group.color,
          size,
          quantity: Math.max(0, Number(raw) || 0),
        })
      }
      return { ...group, rows }
    })
    commit(next)
  }

  /** Suggests a preset not already used, so two blocks don't start identical. */
  function unusedColor(existing: ColorGroup[]): string {
    const used = new Set(existing.map((group) => group.color))
    if (!used.has(NO_COLOR)) return NO_COLOR
    return COLOR_PRESETS.find((preset) => !used.has(preset)) ?? ""
  }

  const colorOptions = [t("variant.noColorLabel"), ...COLOR_PRESETS]
  const displayColor = (color: string) =>
    color === NO_COLOR ? t("variant.noColorLabel") : color
  const storeColor = (input: string) =>
    input.trim() === t("variant.noColorLabel") ? NO_COLOR : input

  return (
    <section className="space-y-3 border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{t("variant.stockRows")}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={addColorBlock}
        >
          <Plus />
          {t("variant.addColorRow")}
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-small text-muted-foreground">
          {t("variant.noRows")}
        </p>
      ) : (
        // A real grid: the size names are one header row, so each colour
        // below it is a single line. Wider than a phone with seven sizes,
        // so the grid scrolls inside its own container rather than
        // widening the form.
        <div className="overflow-x-auto">
          <table className="min-w-max border-separate border-spacing-x-1 border-spacing-y-1">
            <thead>
              <tr className="text-small text-muted-foreground">
                <th className="text-left font-medium">{t("variant.color")}</th>
                {columns.map((size) => (
                  <th key={size} className="w-16 text-center font-medium">
                    {size}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {groups.map((group, index) => (
                <tr key={`group-${index}`}>
                  <td className="w-40">
                    <CreatableCombobox
                      value={displayColor(group.color)}
                      onValueChange={(next) => renameColor(index, storeColor(next))}
                      options={colorOptions}
                      disabled={disabled}
                      placeholder={t("variant.colorPlaceholder")}
                      createLabel={(query) =>
                        t("product.addOption", { value: query })
                      }
                    />
                  </td>

                  {columns.map((size) => {
                    const row = group.rows.get(size)
                    return (
                      <td key={size} className="w-16">
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          disabled={disabled}
                          aria-label={`${displayColor(group.color)} ${size}`}
                          placeholder="—"
                          value={row ? String(row.quantity ?? 0) : ""}
                          onChange={(event) =>
                            setQuantity(index, size, event.target.value)
                          }
                          className={cn(
                            "px-1 text-center tabular-nums",
                            !row && "text-muted-foreground"
                          )}
                        />
                      </td>
                    )
                  })}

                  <td className="w-8 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={t("variant.removeColor")}
                      onClick={() => removeColorBlock(index)}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-small text-muted-foreground">{t("variant.blankHint")}</p>

      {duplicateColor && (
        <p className="text-small text-destructive">
          {t("variant.duplicateVariant")}
        </p>
      )}
    </section>
  )
}
