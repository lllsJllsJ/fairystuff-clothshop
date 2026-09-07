import type { ComponentType } from "react"
import { ClipboardCheck, PartyPopper, Scissors, Truck } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ActiveCustomerStage } from "@/lib/order-status"

/**
 * The 4 non-terminal stages, in progression order. `cancelled`/`refunded`
 * are never passed here — see `isActiveStage` in `lib/order-status.ts`; the
 * track page renders only the badge + an explanation line for those.
 */
export const ACTIVE_STAGES: ActiveCustomerStage[] = ["received", "preparing", "shipping", "complete"]

const STAGE_ICON: Record<ActiveCustomerStage, ComponentType<{ className?: string }>> = {
  received: ClipboardCheck,
  // A clothing shop's "preparing" step is cut-and-sew / packing work, not a
  // generic warehouse box — Scissors reads as the shop's own craft rather
  // than a stock template icon.
  preparing: Scissors,
  shipping: Truck,
  complete: PartyPopper,
}

/** Each active step's own token color, matching `CustomerStatusBadge`'s
 * per-stage palette exactly (DESIGN.md tokens, no new colors introduced). */
const STAGE_ACTIVE_COLOR: Record<ActiveCustomerStage, string> = {
  received: "var(--secondary)",
  preparing: "var(--warning)",
  shipping: "var(--primary)",
  complete: "var(--pastel-green)",
}

/** i18n keys for the highlighted "current stage" card rendered alongside
 * the stepper on the track page — one title/body pair per active stage. */
export const STAGE_TITLE_KEY: Record<ActiveCustomerStage, string> = {
  received: "stageReceivedTitle",
  preparing: "stagePreparingTitle",
  shipping: "stageShippingTitle",
  complete: "stageCompleteTitle",
}
export const STAGE_BODY_KEY: Record<ActiveCustomerStage, string> = {
  received: "stageReceivedBody",
  preparing: "stagePreparingBody",
  shipping: "stageShippingBody",
  complete: "stageCompleteBody",
}

/**
 * Horizontal step indicator for the 4 non-terminal customer stages.
 * Completed steps (before the current one) render in a single
 * `--pastel-green` regardless of which stage they were, so the filled trail
 * reads as one continuous "progress made" color rather than a multi-hued
 * history; the CURRENT step alone gets its own stage color from
 * `CustomerStatusBadge`'s palette, and upcoming steps stay outlined/muted.
 */
export function StatusStepper({
  stage,
  labels,
}: {
  stage: ActiveCustomerStage
  labels: Record<ActiveCustomerStage, string>
}) {
  const currentIndex = ACTIVE_STAGES.indexOf(stage)

  return (
    <ol className="flex items-stretch" aria-label="Order progress">
      {ACTIVE_STAGES.map((step, i) => {
        const Icon = STAGE_ICON[step]
        const isDone = i < currentIndex
        const isActive = i === currentIndex
        const isUpcoming = i > currentIndex
        const circleColor = isDone ? "var(--pastel-green)" : isActive ? STAGE_ACTIVE_COLOR[step] : undefined

        return (
          <li key={step} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "h-0.5 flex-1",
                  i === 0 ? "opacity-0" : i <= currentIndex ? "bg-[var(--pastel-green)]" : "bg-border"
                )}
              />
              <span
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-full)] border-2 transition-colors",
                  isUpcoming ? "border-border bg-background text-muted-foreground" : "border-transparent text-white"
                )}
                style={circleColor ? { backgroundColor: circleColor } : undefined}
              >
                <Icon className="size-5" />
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "h-0.5 flex-1",
                  i === ACTIVE_STAGES.length - 1 ? "opacity-0" : i < currentIndex ? "bg-[var(--pastel-green)]" : "bg-border"
                )}
              />
            </div>
            <span
              className={cn(
                "mt-2 px-1 text-center text-small leading-tight",
                isUpcoming ? "text-muted-foreground" : "font-bold text-foreground"
              )}
            >
              {labels[step]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
