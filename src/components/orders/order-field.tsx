import { Label } from "@/components/ui/label"

/**
 * Same small labeled-field wrapper as the unexported `Field` in
 * `components/products/product-form.tsx`. Duplicated rather than imported
 * because that component isn't exported (and this phase's file scope
 * doesn't include editing `product-form.tsx` to export it) — a ~15-line
 * presentational wrapper is cheap enough to keep local to `orders/` and
 * shared across `order-form.tsx` / `order-line-row.tsx` from here instead
 * of duplicating it a second time in each.
 */
export function Field({
  label,
  error,
  required,
  className,
  children,
}: {
  label: string
  error?: string | boolean
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className ?? "grid gap-1.5"}>
      <Label className="text-body">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {typeof error === "string" && error && (
        <p className="text-small text-destructive">{error}</p>
      )}
    </div>
  )
}
