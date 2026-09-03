import { formatBaht } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Selling price only — this file (like every other file under
 * src/components/shop) must never receive `originalPrice`. There is no
 * "was / now" strike-through here on purpose: the public data contract
 * (src/db/queries/storefront.ts) never carries the cost or original price,
 * so there is nothing to compare against.
 */
export function Price({
  value,
  className,
  size = "default",
}: {
  value: number | string
  className?: string
  size?: "default" | "lg"
}) {
  return (
    <span
      className={cn(
        "font-bold text-primary",
        size === "lg" ? "text-h3" : "text-body",
        className
      )}
    >
      {formatBaht(Number(value))}
    </span>
  )
}
