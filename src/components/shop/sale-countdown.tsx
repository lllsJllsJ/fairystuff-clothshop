"use client"

import { Fragment, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { Clock } from "lucide-react"

import { clsx } from "clsx"

// clsx, not cn(): tailwind-merge reads the custom text-body/text-h4 size
// utilities as colours and would drop text-sale (or the size) — keep both.
const cx = clsx

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A once-a-second clock. The snapshot is whole seconds, so it is stable
 * between ticks; the server snapshot is null, so nothing time-dependent
 * renders until the visitor's own clock is known (no hydration mismatch —
 * the server's clock and the visitor's differ, and an ISR page may be
 * minutes old). */
function subscribeToClock(onTick: () => void): () => void {
  const id = setInterval(onTick, SECOND)
  return () => clearInterval(id)
}
const clientNow = () => Math.floor(Date.now() / SECOND) * SECOND
const serverNow = () => null

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

type Remaining = { ended: boolean; days: number; hours: number; minutes: number; seconds: number }

/** Time left until `endsAt`, ticking every second; null before mount or for
 * an unparseable date. At zero it reports `ended` — checkout re-prices
 * server-side, so a stale cart is caught there (`cart_changed`), not here. */
function useRemaining(endsAt: string): Remaining | null {
  const now = useSyncExternalStore(subscribeToClock, clientNow, serverNow)
  if (now == null) return null
  const remaining = new Date(endsAt).getTime() - now
  if (Number.isNaN(remaining)) return null
  if (remaining <= 0) return { ended: true, days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    ended: false,
    days: Math.floor(remaining / DAY),
    hours: Math.floor((remaining % DAY) / HOUR),
    minutes: Math.floor((remaining % HOUR) / MINUTE),
    seconds: Math.floor((remaining % MINUTE) / SECOND),
  }
}

/** Inline "Sale ends in 2d 04:13:22" — the product page. */
export function SaleCountdown({ endsAt, className }: { endsAt: string; className?: string }) {
  const t = useTranslations("shop")
  const left = useRemaining(endsAt)
  if (!left) return null

  if (left.ended) {
    return <p className={cx("text-small font-bold text-muted-foreground", className)}>{t("saleEnded")}</p>
  }

  const clock = `${pad(left.hours)}:${pad(left.minutes)}:${pad(left.seconds)}`
  return (
    <p
      className={cx(
        "inline-flex items-center gap-2 bg-sale-soft px-3 py-2 text-body font-bold text-sale tabular-nums",
        className
      )}
      style={{ borderRadius: "var(--radius-badge-sm)" }}
      role="timer"
      aria-live="off"
    >
      <Clock className="size-4" aria-hidden />
      {left.days > 0 ? t("saleEndsInDays", { days: left.days, clock }) : t("saleEndsIn", { clock })}
    </p>
  )
}

/**
 * Days / Hrs / Min / Sec tiles — the home-page sale banner. Renders "--"
 * placeholders until mounted so the tiles hold their size (no layout shift
 * when the real numbers arrive).
 */
export function SaleCountdownTiles({
  endsAt,
  className,
  labelClassName,
}: {
  endsAt: string
  className?: string
  /** Letter-case/spacing for the unit labels (Latin caps vs Thai). */
  labelClassName?: string
}) {
  const t = useTranslations("shop")
  const left = useRemaining(endsAt)

  if (left?.ended) {
    return <p className={cx("text-body font-bold", className)}>{t("saleEnded")}</p>
  }

  const units = [
    { key: "days", value: left?.days, label: t("countdownDays") },
    { key: "hours", value: left?.hours, label: t("countdownHours") },
    { key: "minutes", value: left?.minutes, label: t("countdownMinutes") },
    { key: "seconds", value: left?.seconds, label: t("countdownSeconds") },
  ]

  return (
    <div className={cx("flex items-start gap-1", className)} role="timer" aria-live="off">
      {units.map((unit, index) => (
        <Fragment key={unit.key}>
          {index > 0 && (
            <span className="pt-1.5 text-body leading-none font-bold opacity-60" aria-hidden>
              :
            </span>
          )}
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex h-8 min-w-9 items-center justify-center bg-sale-foreground px-1.5 text-subtitle leading-none font-bold text-sale tabular-nums">
              {unit.value == null ? "--" : pad(unit.value)}
            </span>
            <span className={cx("text-[10px] leading-none font-bold opacity-85", labelClassName)}>{unit.label}</span>
          </div>
        </Fragment>
      ))}
    </div>
  )
}
