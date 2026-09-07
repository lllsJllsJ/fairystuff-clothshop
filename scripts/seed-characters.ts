/**
 * Seeds the customer-facing character taxonomy (the chips on `/` and the
 * `?character=<slug>` filter on `/shop`). Idempotent — safe to re-run.
 *
 * The list and the seed/reset logic live in src/lib/character-seed.ts, shared
 * with the "Restore defaults" / "Reset to defaults" buttons on the admin
 * Settings page — this script is just the CLI over it.
 *
 * Usage:
 *   npm run db:seed:characters              restore the canonical list, leave
 *                                           any owner-added extras alone
 *   npm run db:seed:characters -- --reset   also delete characters that are
 *                                           not in the canonical list
 *   npm run db:seed:characters -- --reset --force
 *                                           ...including ones still attached
 *                                           to products (their product links
 *                                           are dropped too — local dev only)
 */
import { seedCharacters, SEED_CHARACTERS } from "../src/lib/character-seed"

async function main() {
  const reset = process.argv.includes("--reset")
  const force = process.argv.includes("--force")

  console.log(`Seeding ${SEED_CHARACTERS.length} characters...`)
  const { deleted, skipped } = await seedCharacters({ reset, force })

  if (reset) {
    if (deleted.length > 0) console.log(`Removed ${deleted.length}: ${deleted.join(", ")}`)
    if (skipped.length > 0) {
      console.log(
        `Kept ${skipped.length} still attached to products (re-run with --force to delete anyway): ${skipped.join(", ")}`
      )
    }
    if (deleted.length === 0 && skipped.length === 0) console.log("No extra characters to remove.")
  }

  console.log("Done.")
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Character seed failed:", error)
    process.exit(1)
  })
