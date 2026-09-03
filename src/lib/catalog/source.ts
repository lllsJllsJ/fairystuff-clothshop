import { lookup } from "node:dns/promises"
import { createHash } from "node:crypto"

const PAGE_HOSTS = [
  "shein.com",
  "amazon.com",
  "1688.com",
  "taobao.com",
] as const

const IMAGE_HOSTS = [
  ...PAGE_HOSTS,
  "ltwebstatic.com",
  "media-amazon.com",
  "ssl-images-amazon.com",
  "alicdn.com",
] as const

const MAX_PAGE_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

export type CanonicalSource = {
  url: string | null
  identity: string
  supplier: string | null
}

export type SupplierPage = {
  title: string | null
  color: string | null
  imageUrls: string[]
  warning: string | null
}

export function extractFirstUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const match = value.match(/https?:\/\/[^\s]+/i)
  if (!match) return null
  return match[0].replace(/[),.;]+$/, "")
}

export function canonicalizeSource(raw: unknown, fallbackIdentity: string): CanonicalSource {
  const extracted = extractFirstUrl(raw)
  if (!extracted) {
    return { url: null, identity: `workbook:${fallbackIdentity}`, supplier: null }
  }

  let parsed: URL
  try {
    parsed = new URL(extracted)
  } catch {
    return { url: null, identity: `workbook:${fallbackIdentity}`, supplier: null }
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
  const path = decodeURIComponent(parsed.pathname)

  const sheinId = path.match(/-p-(\d+)\.html/i)?.[1]
  if (host.endsWith("shein.com") && sheinId) {
    return {
      url: `https://${parsed.hostname}${parsed.pathname}`,
      identity: `shein:${sheinId}`,
      supplier: "SHEIN",
    }
  }
  if (host === "onelink.shein.com") {
    return {
      url: `https://onelink.shein.com${parsed.pathname}`,
      identity: `shein-share:${parsed.pathname.replace(/^\//, "")}`,
      supplier: "SHEIN",
    }
  }

  const asin = path.match(/\/dp\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase()
  if (host.endsWith("amazon.com") && asin) {
    return {
      url: `https://www.amazon.com/dp/${asin}`,
      identity: `amazon:${asin}`,
      supplier: "Amazon",
    }
  }

  const offerId = path.match(/\/offer\/(\d+)\.html/i)?.[1]
  if (host.endsWith("1688.com") && offerId) {
    return {
      url: `https://detail.1688.com/offer/${offerId}.html`,
      identity: `1688:${offerId}`,
      supplier: "1688",
    }
  }

  const taobaoId = parsed.searchParams.get("id")
  if (host.endsWith("taobao.com") && taobaoId && /^\d+$/.test(taobaoId)) {
    return {
      url: `https://item.taobao.com/item.htm?id=${taobaoId}`,
      identity: `taobao:${taobaoId}`,
      supplier: "Taobao",
    }
  }

  return {
    url: null,
    identity: `workbook:${fallbackIdentity}`,
    supplier: null,
  }
}

function hostAllowed(hostname: string, suffixes: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

export function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase()
  if (value === "::1" || value === "0.0.0.0" || value.startsWith("fe80:")) return true
  if (value.startsWith("fc") || value.startsWith("fd")) return true
  const octets = value.split(".").map(Number)
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n))) return false
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
}

async function assertPublicHost(url: URL, kind: "page" | "image"): Promise<void> {
  if (url.protocol !== "https:") throw new Error("Only HTTPS supplier resources are allowed")
  if (!hostAllowed(url.hostname, kind === "page" ? PAGE_HOSTS : IMAGE_HOSTS)) {
    throw new Error(`Host is not allow-listed: ${url.hostname}`)
  }
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(`Host resolves to a private address: ${url.hostname}`)
  }
}

async function fetchBounded(
  initialUrl: string,
  kind: "page" | "image",
  maxBytes: number
): Promise<{ bytes: Buffer; contentType: string; finalUrl: string }> {
  let current = new URL(initialUrl)
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    await assertPublicHost(current, kind)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; ClothshopCatalogue/1.0)",
          accept: kind === "page" ? "text/html,application/xhtml+xml" : "image/*",
          "accept-language": "th-TH,th;q=0.9,en;q=0.8",
        },
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location) throw new Error(`Redirect ${response.status} has no Location header`)
        current = new URL(location, current)
        continue
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const declared = Number(response.headers.get("content-length") ?? 0)
      if (declared > maxBytes) throw new Error(`Resource exceeds ${maxBytes} bytes`)
      const reader = response.body?.getReader()
      if (!reader) throw new Error("Response has no body")
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) {
          await reader.cancel()
          throw new Error(`Resource exceeds ${maxBytes} bytes`)
        }
        chunks.push(value)
      }
      return {
        bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
        contentType: response.headers.get("content-type")?.split(";")[0] ?? "",
        finalUrl: current.toString(),
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error("Too many redirects")
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
}

function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const first = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i")
  )
  const second = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i")
  )
  return decodeHtml(first?.[1] ?? second?.[1] ?? "").trim() || null
}

function candidateImages(html: string): string[] {
  const decoded = decodeHtml(html)
  const candidates = [metaContent(decoded, "og:image"), metaContent(decoded, "twitter:image")]
  for (const match of decoded.matchAll(/https?:\/\/[^"'<>\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s]*)?/gi)) {
    candidates.push(match[0])
  }
  const out: string[] = []
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const parsed = new URL(candidate)
      if (!hostAllowed(parsed.hostname, IMAGE_HOSTS)) continue
      if (/(?:review|comment|avatar|logo|icon|sprite|size[-_]?chart|swatch|video|option[-_]?grid)/i.test(parsed.pathname)) {
        continue
      }
      parsed.hash = ""
      const normalized = parsed.toString()
      if (!out.includes(normalized)) out.push(normalized)
    } catch {
      // Ignore malformed page-provided URLs.
    }
  }
  return out.slice(0, 12)
}

export async function fetchSupplierPage(url: string): Promise<SupplierPage> {
  try {
    const response = await fetchBounded(url, "page", MAX_PAGE_BYTES)
    if (!response.contentType.includes("html")) throw new Error("Supplier response is not HTML")
    const html = response.bytes.toString("utf8")
    const title = metaContent(html, "og:title") ?? metaContent(html, "twitter:title")
    const color =
      metaContent(html, "product:color") ??
      html.match(/"color"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)?.[1] ??
      null
    const imageUrls = candidateImages(html)
    if (!title && imageUrls.length === 0) {
      throw new Error("Supplier page exposed no product metadata")
    }
    return { title, color: color ? decodeHtml(color) : null, imageUrls, warning: null }
  } catch (error) {
    return {
      title: null,
      color: null,
      imageUrls: [],
      warning: `Supplier enrichment failed: ${error instanceof Error ? error.message : "unknown error"}`,
    }
  }
}

export async function downloadSupplierImage(url: string): Promise<Buffer> {
  const response = await fetchBounded(url, "image", MAX_IMAGE_BYTES)
  if (!response.contentType.startsWith("image/")) {
    throw new Error(`Supplier image has invalid content type: ${response.contentType || "unknown"}`)
  }
  return response.bytes
}

export function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}
