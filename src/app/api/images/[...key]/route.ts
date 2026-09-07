import { NoSuchKey, S3ServiceException } from "@aws-sdk/client-s3"

import { getProductImage } from "@/lib/r2"
import { isProductImageKey } from "@/lib/product-image-keys"
import { isBrandLogoKey } from "@/lib/brand-image-keys"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  const { key: segments } = await context.params
  const storageKey = segments.join("/")
  if (!isProductImageKey(storageKey) && !isBrandLogoKey(storageKey)) {
    return new Response("Not found", { status: 404 })
  }

  try {
    const object = await getProductImage(storageKey)
    const etag = object.ETag
    if (etag && request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } })
    }
    if (!object.Body) return new Response("Not found", { status: 404 })

    const headers = new Headers({
      "Content-Type": object.ContentType ?? "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    })
    if (etag) headers.set("ETag", etag)
    if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength))

    return new Response(object.Body.transformToWebStream(), { headers })
  } catch (error) {
    if (error instanceof NoSuchKey || (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)) {
      return new Response("Not found", { status: 404 })
    }
    console.error("Failed to read product image", storageKey, error)
    return new Response("Failed to load image", { status: 502 })
  }
}
