/**
 * Stores and compares phone numbers in one predictable form while still
 * accepting common display formatting from customers.
 */
export function normalizePhone(value: string): string {
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, "")
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`
}

export function isValidPhone(value: string): boolean {
  return /^\+?\d{5,30}$/.test(value)
}
