// Deliberately NO `import "server-only"` here: scripts/seed.ts and
// scripts/create-owner.ts import this file directly via `tsx`, outside any
// Next.js bundling context, and "server-only" throws unconditionally when
// required as plain Node. Put "server-only" guards on the query modules
// under src/db/queries/ instead, where "never reachable from a client
// bundle" is actually the intent.
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"

import * as schema from "./schema"

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Railway injects it when a Postgres service " +
        "is attached; locally, `docker compose up -d` then use the value in " +
        ".env.example. See DEPLOYMENT.md."
    )
  }
  return url
}

/**
 * Railway Postgres over its PRIVATE network (`*.railway.internal`) is not
 * TLS-terminated and rejects an SSL handshake; the public proxy host requires
 * one. Decide from the host rather than forcing either, so the same code runs
 * against a Railway private URL, a Railway public URL, and a local Docker
 * container.
 */
function sslFor(url: string): false | { rejectUnauthorized: boolean } {
  try {
    const { hostname } = new URL(url)
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".railway.internal")
    return isLocal ? false : { rejectUnauthorized: false }
  } catch {
    return false
  }
}

const connectionString = requireDatabaseUrl()

/**
 * One pool per process. The app runs as a long-lived container on Railway,
 * not as serverless functions, so a real connection pool is the right shape:
 * connections are opened once and reused, instead of paying a round trip per
 * query the way a stateless HTTP driver would.
 *
 * `max` is deliberately modest. Railway's Postgres plans cap total
 * connections, and a single-owner shop needs nowhere near ten concurrent
 * queries — leaving headroom means a migration or a psql session can still
 * connect while the app is running.
 */
const pool = new Pool({
  connectionString,
  ssl: sslFor(connectionString),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

/**
 * The database handle. Use this everywhere, including for transactions:
 *
 *   await db.transaction(async (tx) => { ... })
 *
 * That works because this is a pooled driver. It did NOT work under the
 * previous Neon HTTP driver, which had no interactive transactions and
 * failed at runtime — hence the separate `txDb()` below. That hazard is gone.
 */
export const db = drizzle(pool, { schema })

/**
 * @deprecated Retained only so existing call sites keep working; `db` is now
 * fully transaction-capable, so `txDb()` and `db` are the same handle. Prefer
 * `db.transaction(...)` in new code and drop this once the last caller is
 * migrated.
 */
export function txDb() {
  return db
}

export type Database = typeof db
