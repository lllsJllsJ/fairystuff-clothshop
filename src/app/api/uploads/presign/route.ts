import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { presignProductImagePut } from "@/lib/r2"
import { getCurrentUser } from "@/lib/auth-helpers"
import { isOwner } from "@/lib/roles"

/**
 * Owner-gated. Returns presigned object-storage PUT URLs for the exact keys the
 * browser already computed client-side (plan §7 — the resize step happens
 * before this call, via lib/image-resize.ts). This endpoint never invents
 * a storage key itself; it only signs the ones it's handed, after
 * confirming they are well-formed.
 *
 * NOTE on the 401: as with `/api/admin/products`, `src/proxy.ts` already
 * redirects an unauthenticated request matching `/api/uploads/:path*` to
 * `/login` before this handler runs. The check below is still required —
 * see that route's comment — and is what stops a caller from getting a
 * signed URL if the proxy's coverage is ever narrowed.
 *
 * ---------------------------------------------------------------------
 * Constraining what can be presigned (plan: "a presign endpoint that
 * signs arbitrary keys is a write-anything-to-my-bucket hole")
 * ---------------------------------------------------------------------
 * Three independent layers, each redundant with the others on purpose:
 *   1. `presignRequestSchema` bounds the request shape: `productId` must
 *      be a real UUID, and `keys` is capped at MAX_KEYS_PER_REQUEST — a
 *      single photo produces at most 3 renditions (lib/image-resize.ts's
 *      PRODUCT_IMAGE_WIDTHS), so this is generous headroom for a batch of
 *      photos in one upload, not an invitation to sign hundreds of keys.
 *   2. `PRODUCT_IMAGE_KEY_PATTERN` re-derives the exact key shape
 *      `buildProductImageKey()` produces
 *      (`products/<productId>/<timestamp>-<index>-<width>.webp`) and
 *      rejects anything that doesn't match byte-for-byte — no path
 *      traversal, no arbitrary extension, no key outside the three
 *      pre-generated widths.
 *   3. `presignProductImagePut()` itself (lib/r2.ts) re-validates every
 *      key starts with `products/<productId>/` before signing, so even if
 *      the two checks above were ever weakened, a caller still cannot
 *      obtain a URL outside their own product's folder.
 */

const MAX_KEYS_PER_REQUEST = 30

const presignRequestSchema = z.object({
  productId: z.uuid(),
  keys: z.array(z.string().min(1).max(300)).min(1).max(MAX_KEYS_PER_REQUEST),
})

const PRODUCT_IMAGE_WIDTHS = [480, 800, 1600] as const

function isWellFormedKey(key: string, productId: string): boolean {
  const pattern = new RegExp(
    `^products/${productId}/\\d+-\\d+-(${PRODUCT_IMAGE_WIDTHS.join("|")})\\.webp$`
  )
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
    const { productId, keys } = parsed.data

    if (!keys.every((key) => isWellFormedKey(key, productId))) {
      return NextResponse.json({ error: "invalid" }, { status: 400 })
    }

    const uploads = await presignProductImagePut(productId, keys)
    return NextResponse.json({ uploads })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}
