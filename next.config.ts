import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const nextConfig: NextConfig = {
  images: {
    // Passthrough loader against R2 — no host's image-optimization
    // service sits in the critical path (plan §7 / host-agnostic
    // constraint). See src/lib/image-loader.ts.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    remotePatterns: [],
  },
}

export default withNextIntl(nextConfig)
