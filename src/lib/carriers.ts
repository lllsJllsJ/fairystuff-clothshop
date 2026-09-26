/**
 * Customer-shipping carriers offered in the order form, and — where the
 * carrier has a stable public tracking page — the link shown on
 * /track/[code]. The carrier field is free text: a name not listed here is
 * stored as typed and simply gets no link (the tracking number is still
 * shown with a copy button).
 */

export type Carrier = {
  /** Stored value = display name. */
  name: string
  /** `{tracking}` is replaced with the URL-encoded tracking number. */
  trackingUrl?: string
}

export const CARRIERS: readonly Carrier[] = [
  { name: "Thailand Post", trackingUrl: "https://track.thailandpost.co.th/?trackNumber={tracking}" },
  { name: "Kerry Express (KEX)", trackingUrl: "https://th.kex-express.com/th/track/?track={tracking}" },
  { name: "Flash Express", trackingUrl: "https://www.flashexpress.co.th/fle/tracking?se={tracking}" },
  { name: "J&T Express" },
  { name: "Ninja Van", trackingUrl: "https://www.ninjavan.co/th-th/tracking?id={tracking}" },
  { name: "SPX Express" },
  { name: "Best Express" },
  { name: "DHL", trackingUrl: "https://www.dhl.com/th-en/home/tracking.html?tracking-id={tracking}" },
]

export const CARRIER_NAMES: readonly string[] = CARRIERS.map((carrier) => carrier.name)

/** Public tracking link for a carrier + number, or null when unknown. */
export function trackingUrlFor(carrier: string | null | undefined, trackingNo: string | null | undefined): string | null {
  const number = trackingNo?.trim()
  const name = carrier?.trim().toLowerCase()
  if (!number || !name) return null
  const match = CARRIERS.find((entry) => entry.name.toLowerCase() === name)
  if (!match?.trackingUrl) return null
  return match.trackingUrl.replace("{tracking}", encodeURIComponent(number))
}
