import { Noto_Sans_TC, Noto_Sans_Thai, Geist_Mono } from "next/font/google"

/**
 * Noto Sans TC has Latin + CJK glyphs but no Thai glyphs; Noto Sans Thai
 * fills that gap. The CSS font-stack in globals.css lists TC first (so Latin
 * renders per DESIGN.md) with Thai falling through per-glyph. Weights 400/700
 * only, per DESIGN.md §3.
 *
 * Shared here rather than declared in a layout because two separate files
 * render an <html> element — src/app/[locale]/layout.tsx and the root
 * src/app/not-found.tsx — and both need the same font variables.
 */
export const notoTC = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
})

export const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "700"],
  display: "swap",
})

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
})

/** ClassName for the <html> element. */
export const fontVariables = `${notoTC.variable} ${notoThai.variable} ${geistMono.variable}`
