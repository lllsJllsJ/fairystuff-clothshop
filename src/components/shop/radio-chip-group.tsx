"use client"

import { useRef } from "react"

export type ChipOption = {
  value: string
  label: string
  disabled?: boolean
}

/**
 * Shared roving-tabindex mechanics for the colour and size pickers on the
 * product detail page: real `role="radiogroup"` / `role="radio"` semantics,
 * one tab stop for the whole group, and arrow-key movement between options
 * (Home/End jump to the ends) — matches native radio-group keyboard
 * behaviour without a hidden `<input type="radio">` per option, so the
 * visual chip can be styled freely via `renderOption`.
 *
 * `disabled` options (sold-out sizes) are never removed from `options` and
 * never get the native `disabled` attribute — they carry `aria-disabled`
 * instead, so they stay in the DOM, stay reachable via arrow keys, and stay
 * announced to assistive tech. Only the click/keydown select handler blocks
 * them (see DESIGN.md's colour/size interaction rule).
 */
export function RadioChipGroup({
  ariaLabel,
  options,
  value,
  onChange,
  renderOption,
  className,
}: {
  ariaLabel: string
  options: ChipOption[]
  value: string | null
  onChange: (value: string) => void
  renderOption: (option: ChipOption, selected: boolean) => React.ReactNode
  className?: string
}) {
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  function focusOptionAt(index: number) {
    const option = options[index]
    if (!option) return
    buttonRefs.current.get(option.value)?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (options.length === 0) return
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault()
      focusOptionAt((index + 1) % options.length)
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault()
      focusOptionAt((index - 1 + options.length) % options.length)
    } else if (event.key === "Home") {
      event.preventDefault()
      focusOptionAt(0)
    } else if (event.key === "End") {
      event.preventDefault()
      focusOptionAt(options.length - 1)
    }
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={className}>
      {options.map((option, index) => {
        const selected = option.value === value
        const isTabStop = value ? selected : index === 0
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) buttonRefs.current.set(option.value, el)
              else buttonRefs.current.delete(option.value)
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={option.disabled || undefined}
            tabIndex={isTabStop ? 0 : -1}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => {
              if (option.disabled) return
              onChange(option.value)
            }}
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {renderOption(option, selected)}
          </button>
        )
      })}
    </div>
  )
}
