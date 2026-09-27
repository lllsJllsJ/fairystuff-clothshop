import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { presignBrandLogoPut, presignHeroImagePut } from "@/lib/r2"
import { getCurrentUser } from "@/lib/auth-helpers"
import { isOwner } from "@/lib/roles"
import {
  BRAND_LOGO_WIDTHS,
  HERO_IMAGE_WIDTHS,
  isHeroImageKey,
} from "@/lib/brand-image-keys"

/**
 * Owner-gated, same shape as `/api/uploads/presign` — see that route's
 * comment for the full "signs arbitrary keys is a write-anything-to-my-
 * bucket hole" rationale. Split into its own route rather than widening
 * the product one because the key shape has no `productId` segment at
 * all (there is only ever one logo), so a single shared validator would
 * need to branch on request shape for no real benefit.
 *
 * Also signs the home-page hero carousel photos (`brand/hero-...`): one
 * request is one picked photo's renditions, and every key in it must be
 * the SAME kind — all logo keys or all hero keys, never a mix.
 */

const MAX_KEYS_PER_REQUEST = Math.max(BRAND_LOGO_WIDTHS.length, HERO_IMAGE_WIDTHS.length)

const presignRequestSchema = z.object({
  keys: z.array(z.string().min(1).max(300)).min(1).max(MAX_KEYS_PER_REQUEST),
})

function isWellFormedKey(key: string): boolean {
  const pattern = new RegExp(`^brand/logo-\\d+-(${BRAND_LOGO_WIDTHS.join("|")})\\.webp$`)
  return pattern.test(key)
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (!isOwner(user.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const parsed = presignRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid" }, { status: 400 })
    }
    const { keys } = parsed.data

    if (keys.every(isHeroImageKey)) {
      const uploads = await presignHeroImagePut(keys)
      return NextResponse.json({ uploads })
    }
    if (!keys.every(isWellFormedKey)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 })
    }

    const uploads = await presignBrandLogoPut(keys)
    return NextResponse.json({ uploads })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}
