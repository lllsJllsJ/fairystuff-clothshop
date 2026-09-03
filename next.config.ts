import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

/**
 * R2's public hostname, derived from `NEXT_PUBLIC_R2_PUBLIC_URL` (see
 * .env.example). Returns undefined (rather than throwing) when unset so a
 * build without R2 configured yet — e.g. a fresh checkout, or the type-
 * check-only builds run in this phase — doesn't fail outright; `next/image`
 * just has nothing to allow-list until the env var is set.
 */
function r2PublicHostname(): string | undefined {
  const url = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  if (!url) return undefined
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

const r2Hostname = r2PublicHostname()

const nextConfig: NextConfig = {
  images: {
    // Passthrough loader against R2 — no host's image-optimization
    // service sits in the critical path (plan §7 / host-agnostic
    // constraint). See src/lib/image-loader.ts.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    remotePatterns: r2Hostname
      ? [{ protocol: "https", hostname: r2Hostname }]
      : [],
  },
}

export default withNextIntl(nextConfig)
