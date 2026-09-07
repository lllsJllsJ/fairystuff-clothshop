import type { CustomerOrderStage } from "@/lib/order-status"

const styles: Record<CustomerOrderStage, string> = {
  received: "bg-secondary text-secondary-foreground",
  preparing: "bg-warning text-warning-foreground",
  shipping: "bg-primary text-primary-foreground",
  complete: "bg-[var(--pastel-green)] text-white",
  cancelled: "bg-destructive text-destructive-foreground",
  refunded: "bg-muted text-muted-foreground",
}

export function CustomerStatusBadge({ stage, label }: { stage: CustomerOrderStage; label: string }) {
  return <span className={`inline-flex rounded-[var(--radius-pill)] px-3 py-1.5 text-small font-bold ${styles[stage]}`}>{label}</span>
}
