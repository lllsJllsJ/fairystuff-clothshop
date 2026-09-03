import "server-only"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { PRODUCT_IMAGE_WIDTHS, productImageRenditionKeys } from "@/lib/product-image-keys"

/**
 * S3-compatible object-storage client. Server-only — this reads secret
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
 * LOCAL DEVELOPMENT: set `STORAGE_ENDPOINT` to an
 * S3-compatible server — `docker-compose.yml` runs MinIO on
 * http://localhost:9000 for exactly this. Setting it also flips the client
 * to path-style addressing (`<endpoint>/<bucket>/<key>`), which MinIO
 * requires. Railway Buckets use virtual-hosted addressing, so production sets
 * `STORAGE_FORCE_PATH_STYLE=false`. Legacy R2 variable names remain accepted
 * to avoid breaking an existing deployment. See README "Installation & Setup".
 */

const PRESIGN_EXPIRY_SECONDS = 300

function requireOne(names: string[]): string {
  const value = names.map((name) => process.env[name]).find(Boolean)
  if (!value) {
    throw new Error(`${names.join(" or ")} is not set. See .env.example.`)
  }
  return value
}

function bucketName(): string {
  return requireOne(["STORAGE_BUCKET", "R2_BUCKET", "BUCKET"])
}

let cachedClient: S3Client | null = null

function r2Client(): S3Client {
  if (cachedClient) return cachedClient
  const endpoint = process.env.STORAGE_ENDPOINT ?? process.env.R2_ENDPOINT ?? process.env.ENDPOINT
  const accountId = process.env.R2_ACCOUNT_ID
  const forcePathStyle = process.env.STORAGE_FORCE_PATH_STYLE === "true" ||
    Boolean(endpoint && /localhost|127\.0\.0\.1/.test(endpoint))
  cachedClient = new S3Client({
    region: process.env.STORAGE_REGION ?? process.env.REGION ?? "auto",
    endpoint: endpoint ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined),
    forcePathStyle,
    credentials: {
      accessKeyId: requireOne(["STORAGE_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "ACCESS_KEY_ID"]),
      secretAccessKey: requireOne([
        "STORAGE_SECRET_ACCESS_KEY",
        "R2_SECRET_ACCESS_KEY",
        "SECRET_ACCESS_KEY",
      ]),
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
  const bucket = bucketName()
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
      Bucket: bucketName(),
      Key: storageKey,
      Body: body,
      ContentType: "image/webp",
    })
  )
}

/**
 * Deletes one product image from object storage by its key. Best-effort —
 * callers (e.g. `deleteProduct`/`updateProduct` in the action layer) should
 * not fail the surrounding database write if this throws; catch, log, and
 * move on. An orphaned object costs storage; a stuck admin write costs
 * more.
 */
export async function deleteProductImage(storageKey: string): Promise<void> {
  const bucket = bucketName()
  const client = r2Client()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }))
}

export async function getProductImage(storageKey: string) {
  return r2Client().send(new GetObjectCommand({ Bucket: bucketName(), Key: storageKey }))
}

/** The browser and catalogue importer always create these three siblings. */
export { PRODUCT_IMAGE_WIDTHS as PRODUCT_IMAGE_WIDTHS_SERVER, productImageRenditionKeys }

/** Deletes every width behind the canonical 1600w database key. */
export async function deleteProductImageRenditions(storageKey: string): Promise<void> {
  await Promise.all(productImageRenditionKeys(storageKey).map(deleteProductImage))
}
