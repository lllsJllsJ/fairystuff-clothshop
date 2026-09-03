import "server-only"

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { PRODUCT_IMAGE_WIDTHS, productImageRenditionKeys } from "@/lib/product-image-keys"

/**
 * Cloudflare R2 client (S3-compatible). Server-only — this reads secret
 * credentials from the environment, so it must never be imported from a
 * client component; the "server-only" import throws at build time if that
 * ever happens instead of silently shipping secrets to the browser.
 *
 * Flow (plan §7): the browser resizes a picked photo into three WebP blobs
 * client-side (lib/image-resize.ts), computes their storage keys itself
 * under `products/<productId>/...` using a client-generated UUID (the
 * pre-row UUID trick — see that file), and asks `POST /api/uploads/presign`
 * for PUT URLs for exactly those keys. This module only signs URLs for
 * keys the caller already built; it never invents a key itself.
 *
 * LOCAL DEVELOPMENT (no R2 account needed): set `R2_ENDPOINT` to an
 * S3-compatible server — `docker-compose.yml` runs MinIO on
 * http://localhost:9000 for exactly this. Setting it also flips the client
 * to path-style addressing (`<endpoint>/<bucket>/<key>`), which MinIO
 * requires and R2 does not use. Leave `R2_ENDPOINT` unset in production and
 * the real R2 endpoint below is derived from `R2_ACCOUNT_ID` as before —
 * every other layer (key validation, presigning, the public URL the
 * browser fetches) is byte-for-byte the same code path against either
 * backend. See README "Installation & Setup".
 */

const PRESIGN_EXPIRY_SECONDS = 300

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set. See .env.example.`)
  }
  return value
}

let cachedClient: S3Client | null = null

function r2Client(): S3Client {
  if (cachedClient) return cachedClient
  // A local S3-compatible endpoint (MinIO) when R2_ENDPOINT is set,
  // otherwise the real R2 endpoint for this account.
  const localEndpoint = process.env.R2_ENDPOINT
  cachedClient = new S3Client({
    region: "auto",
    endpoint:
      localEndpoint ??
      `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    forcePathStyle: Boolean(localEndpoint),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  })
  return cachedClient
}

export type PresignedUpload = { key: string; url: string }

/**
 * Presigns PUT URLs for storage keys the browser has already computed
 * under `products/<productId>/...` (lib/image-resize.ts#buildProductImageKey).
 * Every key is re-validated against that prefix before signing, so a
 * caller can never obtain a presigned URL outside its own product's
 * folder — defense in depth on top of the owner-only gate on
 * `/api/uploads/presign` (that route itself lives outside this package's
 * scope; see plan §3/§12).
 */
export async function presignProductImagePut(
  productId: string,
  keys: string[]
): Promise<PresignedUpload[]> {
  const prefix = `products/${productId}/`
  const bucket = requireEnv("R2_BUCKET")
  const client = r2Client()

  return Promise.all(
    keys.map(async (key) => {
      if (!key.startsWith(prefix)) {
        throw new Error(
          `Refusing to presign "${key}" — it does not belong to product ${productId}.`
        )
      }
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: "image/webp",
      })
      const url = await getSignedUrl(client, command, {
        expiresIn: PRESIGN_EXPIRY_SECONDS,
      })
      return { key, url }
    })
  )
}

/**
 * Uploads one object directly from the server for the reviewed catalogue
 * importer. Every ordinary admin upload goes browser -> presigned PUT
 * and never passes through this process; this is not a general-purpose
 * upload endpoint and must not be wired directly to request input.
 *
 * Re-validates the key against the caller's product prefix for the same
 * reason `presignProductImagePut` does.
 */
export async function putProductImage(
  productId: string,
  storageKey: string,
  body: Buffer
): Promise<void> {
  const prefix = `products/${productId}/`
  if (!storageKey.startsWith(prefix)) {
    throw new Error(
      `Refusing to upload "${storageKey}" — it does not belong to product ${productId}.`
    )
  }
  await r2Client().send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET"),
      Key: storageKey,
      Body: body,
      ContentType: "image/webp",
    })
  )
}

/**
 * Deletes one product image from R2 by its storage key. Best-effort —
 * callers (e.g. `deleteProduct`/`updateProduct` in the action layer) should
 * not fail the surrounding database write if this throws; catch, log, and
 * move on. An orphaned R2 object costs storage; a stuck admin write costs
 * more.
 */
export async function deleteProductImage(storageKey: string): Promise<void> {
  const bucket = requireEnv("R2_BUCKET")
  const client = r2Client()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }))
}

/** The browser and catalogue importer always create these three siblings. */
export { PRODUCT_IMAGE_WIDTHS as PRODUCT_IMAGE_WIDTHS_SERVER, productImageRenditionKeys }

/** Deletes every width behind the canonical 1600w database key. */
export async function deleteProductImageRenditions(storageKey: string): Promise<void> {
  await Promise.all(productImageRenditionKeys(storageKey).map(deleteProductImage))
}
