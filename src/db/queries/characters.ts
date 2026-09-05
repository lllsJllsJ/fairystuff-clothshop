import "server-only"

import { asc, count, eq, max } from "drizzle-orm"

import { db } from "@/db"
import { characters, productCharacters } from "@/db/schema"

export type Character = typeof characters.$inferSelect

export async function getCharacters(): Promise<Character[]> {
  return db.select().from(characters).orderBy(asc(characters.sortOrder), asc(characters.name))
}

export async function getNextCharacterSortOrder(): Promise<number> {
  const [row] = await db.select({ value: max(characters.sortOrder) }).from(characters)
  return (row?.value ?? -1) + 1
}

export async function getCharacterUsageCount(id: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(productCharacters)
    .where(eq(productCharacters.characterId, id))
  return row?.value ?? 0
}
