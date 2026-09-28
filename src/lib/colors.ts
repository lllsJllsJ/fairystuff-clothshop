/**
 * Colour names are English-only. A variant's colour is plain text
 * (productVariants.color), and the owner's palette (product_colors) holds
 * only English names — so a Thai name typed in the product editor or read
 * from an import sheet is converted here before it is stored.
 *
 * Keep this map in step with drizzle/0012_seed_product_colors.sql, which
 * applied the same conversion to the colours already in the database.
 */
export const THAI_COLOR_TO_ENGLISH: Readonly<Record<string, string>> = {
  ดำ: "Black",
  สีดำ: "Black",
  ขาว: "White",
  สีขาว: "White",
  เทา: "Grey",
  ชมพู: "Pink",
  แดง: "Red",
  ส้ม: "Orange",
  เหลือง: "Yellow",
  เขียว: "Green",
  ฟ้า: "Light Blue",
  น้ำเงิน: "Blue",
  กรม: "Navy",
  กรมท่า: "Navy",
  ม่วง: "Purple",
  น้ำตาล: "Brown",
  ครีม: "Cream",
  เบจ: "Beige",
  ทอง: "Gold",
  เงิน: "Silver",
  หลายสี: "Multicolor",
}

/**
 * Canonical spelling of an English colour: a case-insensitive match against
 * `known` (the palette, or the mapped names above) wins, so "purple" and
 * "PURPLE" both become "Purple". Anything unknown is kept as typed (trimmed).
 */
export function toEnglishColor(raw: string, known: readonly string[] = []): string {
  const name = raw.trim()
  const mapped = THAI_COLOR_TO_ENGLISH[name]
  if (mapped) return mapped
  const lower = name.toLowerCase()
  const candidates = [...known, ...Object.values(THAI_COLOR_TO_ENGLISH)]
  return candidates.find((c) => c.toLowerCase() === lower) ?? name
}
