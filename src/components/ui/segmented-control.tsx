"use client"

import { cn } from "@/lib/utils"

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  /** Optional one-line hint shown under the label. */
  hint?: string
}

/**
 * Radio-group styled as joined pills. Keyboard: native radios, so arrow
 * keys move the selection and Tab leaves the group.
 */
export function SegmentedControl<T extends string>({
  name,
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  name: string
  value: T
  onValueChange: (value: T) => void
  options: SegmentedOption<T>[]
  /** Accessible group label. */
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex w-full rounded-full border border-input bg-muted/60 p-1", className)}
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              "relative flex min-h-9 flex-1 cursor-pointer flex-col items-center justify-center rounded-full px-3 py-1 text-center text-body transition-all has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
              checked
                ? "bg-primary font-bold text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onValueChange(option.value)}
              className="sr-only"
            />
            <span>{option.label}</span>
            {option.hint && (
              <span className={cn("text-small font-normal", checked ? "opacity-90" : "opacity-70")}>
                {option.hint}
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}
