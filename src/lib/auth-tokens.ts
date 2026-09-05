import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { and, eq, gt, lt } from "drizzle-orm"

import { db } from "@/db"
import { authTokens, authTokenType } from "@/db/schema"

type TokenType = (typeof authTokenType.enumValues)[number]

export function hashAuthToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export async function issueAuthToken(userId: string, type: TokenType, lifetimeMs: number) {
  const cutoff = new Date(Date.now() - 60_000)
  const [recent] = await db
    .select({ id: authTokens.id })
    .from(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), gt(authTokens.createdAt, cutoff)))
    .limit(1)
  if (recent) return { ok: false as const, error: "cooldown" as const }

  const token = randomBytes(32).toString("base64url")
  await db.transaction(async (tx) => {
    await tx.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.type, type)))
    await tx.insert(authTokens).values({
      userId,
      type,
      tokenHash: hashAuthToken(token),
      expiresAt: new Date(Date.now() + lifetimeMs),
    })
    await tx.delete(authTokens).where(lt(authTokens.expiresAt, new Date()))
  })
  return { ok: true as const, token }
}

export async function findValidAuthToken(token: string, type: TokenType) {
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(
      eq(authTokens.tokenHash, hashAuthToken(token)),
      eq(authTokens.type, type),
      gt(authTokens.expiresAt, new Date())
    ))
    .limit(1)
  return row ?? null
}
