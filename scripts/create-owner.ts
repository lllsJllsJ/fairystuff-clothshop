/**
 * Interactively creates the owner account. This is the ONLY way an owner
 * user is created — there is no public signup route (plan §4, §6).
 *
 * Usage: npm run create-owner
 */
import * as readline from "node:readline"

import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"

import { db } from "../src/db"
import { users } from "../src/db/schema"

const BCRYPT_SALT_ROUNDS = 12
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const KEY_CTRL_C = "\x03"
const KEY_ENTER = ["\n", "\r", "\x04"] // \x04 = Ctrl+D / EOT
const KEY_BACKSPACE = ["\x7f", "\b"] // \x7f = DEL

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/** Minimal masked prompt — reads raw keystrokes without echoing them back. */
function askPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)

    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    let value = ""

    if (stdin.isTTY) {
      stdin.setRawMode(true)
    }
    stdin.resume()
    stdin.setEncoding("utf8")

    function cleanup() {
      stdin.removeListener("data", onData)
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false)
      }
      stdin.pause()
    }

    function onData(chunk: string) {
      for (const char of chunk) {
        if (KEY_ENTER.includes(char)) {
          cleanup()
          process.stdout.write("\n")
          resolve(value)
          return
        }
        if (char === KEY_CTRL_C) {
          cleanup()
          process.stdout.write("\n")
          process.exit(1)
        }
        if (KEY_BACKSPACE.includes(char)) {
          value = value.slice(0, -1)
          continue
        }
        value += char
      }
    }

    stdin.on("data", onData)
  })
}

async function main() {
  console.log("Create the clothshop owner account.\n")

  let email = ""
  while (!EMAIL_PATTERN.test(email)) {
    email = (await ask("Email: ")).toLowerCase()
    if (!EMAIL_PATTERN.test(email)) {
      console.log("  Enter a valid email address.")
    }
  }

  let password = ""
  while (password.length < 8) {
    password = await askPassword("Password (min 8 characters): ")
    if (password.length < 8) {
      console.log("  Password must be at least 8 characters.")
    }
  }

  const confirm = await askPassword("Confirm password: ")
  if (confirm !== password) {
    console.error("Passwords do not match. Aborting.")
    process.exit(1)
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing.length > 0) {
    console.error(`A user with email ${email} already exists. Aborting.`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS)

  const [created] = await db
    .insert(users)
    .values({ email, passwordHash, role: "owner" })
    .returning({ id: users.id, email: users.email })

  console.log(`\nOwner account created: ${created.email} (${created.id})`)
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("create-owner failed:", error)
    process.exit(1)
  })
