import { MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Contact-channel glyphs. lucide dropped its brand icons, so Instagram and
 * Facebook are tiny hand-drawn marks (camera outline / bold "f") — enough
 * to recognise at a glance next to the channel name, without shipping an
 * icon font. LINE uses a chat bubble on its brand green.
 */
export type ContactChannel = "line" | "instagram" | "facebook"

export function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21h3z" />
    </svg>
  )
}

/** Brand-coloured round badge holding the channel's glyph. */
export function ChannelBadge({ channel, className }: { channel: ContactChannel; className?: string }) {
  const icon = "size-[55%]"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-white",
        channel === "line" && "bg-[var(--brand-line)]",
        channel === "facebook" && "bg-[var(--brand-facebook)]",
        className
      )}
      style={channel === "instagram" ? { background: "var(--brand-instagram)" } : undefined}
      aria-hidden
    >
      {channel === "line" && <MessageCircle className={icon} fill="currentColor" strokeWidth={0} />}
      {channel === "instagram" && <InstagramGlyph className={icon} />}
      {channel === "facebook" && <FacebookGlyph className={icon} />}
    </span>
  )
}
