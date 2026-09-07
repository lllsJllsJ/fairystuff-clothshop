export function normalizeFacebookUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function isValidFacebookUrl(value: string): boolean {
  if (!value) return true
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === "https:" && (
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com") ||
      hostname === "fb.com" ||
      hostname.endsWith(".fb.com")
    )
  } catch {
    return false
  }
}
