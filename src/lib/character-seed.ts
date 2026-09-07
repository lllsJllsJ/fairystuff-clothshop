import { inArray, notInArray } from "drizzle-orm"

import { db } from "@/db"
import { characters, productCharacters } from "@/db/schema"

/**
 * The canonical character taxonomy — the chips on `/` and the
 * `?character=<slug>` filter on `/shop`. Shared by the CLI
 * (`npm run db:seed:characters`) and the admin Settings page's seed buttons,
 * so both restore exactly the same list.
 *
 * `slug` is spelled out rather than derived from `name`: it is the value that
 * ends up in the storefront URL, so a display-name correction must not
 * silently break every link pointing at that character. These match what
 * `slugify()` in admin/settings/workflow-actions.ts produced for the rows
 * entered by hand.
 */
export const SEED_CHARACTERS: ReadonlyArray<{
  name: string
  nameEn: string
  slug: string
  sortOrder: number
}> = [
  { name: "สโนว์ไวท์", nameEn: "Snow White", slug: "สโนว์ไวท์", sortOrder: 0 },
  { name: "ซินเดอเรลล่า", nameEn: "Cinderella", slug: "ซินเดอเรลล่า", sortOrder: 1 },
  { name: "ออโรร่า", nameEn: "Aurora", slug: "ออโรร่า", sortOrder: 2 },
  { name: "แอเรียล", nameEn: "Ariel", slug: "แอเรียล", sortOrder: 3 },
  { name: "เบลล์", nameEn: "Belle", slug: "เบลล์", sortOrder: 4 },
  { name: "จัสมิน", nameEn: "Jasmine", slug: "จัสมิน", sortOrder: 5 },
  { name: "โพคาฮอนทัส", nameEn: "Pocahontas", slug: "โพคาฮอนทัส", sortOrder: 6 },
  { name: "มู่หลาน", nameEn: "Mulan", slug: "มู่หลาน", sortOrder: 7 },
  { name: "ไทอาน่า", nameEn: "Tiana", slug: "ไทอาน่า", sortOrder: 8 },
  { name: "ราพันเซล", nameEn: "Rapunzel", slug: "ราพันเซล", sortOrder: 9 },
  { name: "เมริดา", nameEn: "Merida", slug: "เมริดา", sortOrder: 10 },
]

const CANONICAL_NAMES = SEED_CHARACTERS.map((character) => character.name)

export type SeedCharactersResult = {
  /** Characters in SEED_CHARACTERS — inserted if missing, refreshed if present. */
  seeded: number
  /** Names of non-canonical characters deleted (reset mode only). */
  deleted: string[]
  /** Non-canonical characters left alone because a product still uses them. */
  skipped: string[]
}

/**
 * Restores the canonical list. Idempotent.
 *
 * - `reset: false` (default) — adds what's missing and refreshes `nameEn` /
 *   `sortOrder`; anything the owner added on top is left alone.
 * - `reset: true` — also deletes characters outside the canonical list.
 *   `product_characters.character_id` is ON DELETE RESTRICT, so one still
 *   attached to a product is skipped and reported rather than throwing,
 *   unless `force` drops those links first (CLI-only escape hatch — it
 *   removes real product data).
 *
 * The whole thing runs in one transaction: a partial reset is never left behind.
 */
export async function seedCharacters(
  options: { reset?: boolean; force?: boolean } = {}
): Promise<SeedCharactersResult> {
  return db.transaction(async (tx) => {
    for (const character of SEED_CHARACTERS) {
      // `name` is the unique key. `slug` is deliberately not overwritten on a
      // conflict — an existing row's slug is already live in URLs.
      await tx
        .insert(characters)
        .values(character)
        .onConflictDoUpdate({
          target: characters.name,
          set: { nameEn: character.nameEn, sortOrder: character.sortOrder },
        })
    }

    const result: SeedCharactersResult = {
      seeded: SEED_CHARACTERS.length,
      deleted: [],
      skipped: [],
    }
    if (!options.reset) return result

    const extras = await tx
      .select({ id: characters.id, name: characters.name })
      .from(characters)
      .where(notInArray(characters.name, CANONICAL_NAMES))
    if (extras.length === 0) return result

    const links = await tx
      .select({ characterId: productCharacters.characterId })
      .from(productCharacters)
      .where(inArray(productCharacters.characterId, extras.map((extra) => extra.id)))
    const usedIds = new Set(links.map((link) => link.characterId))

    if (options.force && usedIds.size > 0) {
      await tx
        .delete(productCharacters)
        .where(inArray(productCharacters.characterId, [...usedIds]))
      usedIds.clear()
    }

    const deletable = extras.filter((extra) => !usedIds.has(extra.id))
    if (deletable.length > 0) {
      await tx
        .delete(characters)
        .where(inArray(characters.id, deletable.map((extra) => extra.id)))
    }

    return {
      ...result,
      deleted: deletable.map((extra) => extra.name),
      skipped: extras.filter((extra) => usedIds.has(extra.id)).map((extra) => extra.name),
    }
  })
}
