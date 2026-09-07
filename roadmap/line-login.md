# Roadmap — Alternative login via LINE

**Status: OBSOLETE (2026-09-06, guest checkout).** This plan solved "how does
a LINE-first customer sign in to place an order." The `customer` role no
longer exists — guest checkout removed the account requirement from checkout
entirely (see `CLAUDE.md`), so there is no longer a subject for LINE *Login*
to authenticate. What shipped instead is the LINE *deep-link handoff*: the
`/track/[code]` page builds a prefilled `https://line.me/R/oaMessage/...`
link (see `src/db/queries/settings.ts#lineMessageUrl` and
`src/components/track/contact-admin-button.tsx`) so the customer's own
message to the shop already carries their preorder code — no login, no
OAuth, no account linking. This file is kept for its reasoning (the OIDC
provider research, the null-`password_hash` analysis, the
never-auto-link-by-email decision) in case a future feature genuinely needs
authenticated customer identity again, but nothing below should be built as
written — re-derive the plan against the current schema first.

**Superseded original status:** planned — partially unblocked by the
optional-email work (2026-09-06), see §8.
**Drafted:** 2026-09-06
**Motivation:** most of this shop's customers are LINE-based. Email + password
registration is the wrong front door for them, and the storefront already ends
its checkout with a LINE handoff (`shop_settings.line_id`).

This is a planning document, not documentation of shipped behaviour. Nothing
below is implemented yet, and nothing below now WILL be implemented as
written — see the OBSOLETE banner above.

---

## Deferred ideas noted during the guest-checkout migration (2026-09-06)

Not built, not planned as a numbered phase — just recorded so they aren't
re-discovered from scratch:

- **A "my orders in this browser" localStorage list** on `/track` — remember
  preorder codes the customer has looked up on this device so they don't have
  to keep the code itself. Explicitly out of scope for guest checkout: it adds
  client-side state with no server backing and doesn't survive a cleared
  browser or a different device, which undersells what it promises.
- **`/admin/profile`** — with `/account/profile` gone, there is no UI for an
  owner/staff account to change its own `fullname`. Accepted as a gap for now
  (see `CLAUDE.md`); a small owner-only profile page would close it if it
  becomes a real pain point.
- **A "N orders awaiting review" dashboard tile** — nothing currently notifies
  the owner that a new guest order arrived; they discover it by opening
  `/admin/orders`. A natural follow-up, not built here.

---

## 1. Feasibility — what already works in our favour

- **`next-auth@5.0.0-beta.32` ships a LINE provider already.**
  `next-auth/providers/line` (re-exported from `@auth/core/providers/line`) is
  an OIDC provider: `issuer: "https://access.line.me"`,
  `id_token_signed_response_alg: "HS256"`, `checks: ["state"]`. **No new
  dependency is needed.**
- **The proxy needs no change.** `src/proxy.ts`'s `PROTECTED_PREFIXES` is a
  denylist (`/admin`, `/account`, `/checkout`, `/api/admin`, `/api/uploads`).
  `/api/auth/**` is not in it, so the LINE callback route
  (`/api/auth/callback/line`) is already publicly reachable — which it must be,
  since LINE redirects an unauthenticated browser to it.
- **`orders.customerEmail` is already nullable** (`text("customer_email")`, no
  `.notNull()`), so an order placed by a customer with no email address does
  not violate the orders schema.
- **`src/types/next-auth.d.ts`** already augments `User` / `Session` / `JWT`
  with `id` and `role`, so no type plumbing changes are required.

## 2. The three real obstacles

### 2.1 LINE does not give you an email address by default

> **Largely resolved as of 2026-09-06** — see §8. `users.email` is now
> nullable and checkout no longer requires one. What remains for LINE is the
> `password_hash` nullability and the `line_user_id` column.


Retrieving an email requires a **separate permission application** in the LINE
Developers Console (Login channel → OpenID Connect → Email address permission),
which is reviewed. Even once granted, the **user can decline** to share it at
the consent screen.

That collides with three places:

| Where | What it assumes |
|---|---|
| `src/db/schema.ts` | `users.email` is `text("email").notNull().unique()` |
| `src/app/[locale]/(shop)/checkout/actions.ts:19` | `if (!user \|\| !isCustomer(user.role) \|\| !user.email) return { ok: false, error: "unauthorized" }` |
| same file, order insert | `customerName: user.name \|\| user.email!` |

**Conclusion: do not build on the assumption that a LINE user has an email.**
Making email genuinely optional is more robust than applying for a permission
the user can refuse anyway.

### 2.2 There is no database adapter

`src/auth.ts` uses `session: { strategy: "jwt" }` with **no adapter** — a
deliberate choice (see its header comment: one owner account doesn't need a
`sessions` table, and JWT keeps the proxy able to decode a session without a
database round trip).

The consequence for OAuth: **Auth.js will not create or look up a user row for
us.** Left alone, `token.id` becomes LINE's `sub`, not our UUID. That matters
because `token.id` is what ends up as:

- `orders.customerId` (checkout)
- the row `updateProfile` writes to
- the id the new `/admin/users` screen keys every action on
- `requireCustomer()` / `getCurrentUser()`'s notion of identity

So the `jwt` callback must map LINE's `sub` to **our** `users.id` on every
sign-in, creating the row on first contact.

### 2.3 `users.password_hash` is `NOT NULL`

A LINE-only account has no password. The column has to become nullable.

Note the existing credentials path is *already* safe against a null hash by
accident: `const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH` falls back
to the dummy, `bcrypt.compare` fails, `authorize` returns `null`. That is luck,
not intent — make it an explicit rejection so the guarantee survives a refactor.

## 3. Recommended architecture

### 3.1 Two security decisions, made deliberately

**Never auto-link a LINE identity to an existing account by email.**
If LINE does return an email that matches an existing password account,
auto-linking means anyone who controls a LINE account bearing that address
inherits the shop account. Key strictly on `sub` (`line_user_id`). Linking, if
we ever want it, is an explicit action taken from an *already authenticated*
session — never an implicit side effect of signing in.

**LINE sign-in creates and authenticates `customer` accounts only.**
Never `owner`, never `staff`. The owner keeps password login. With no RLS
behind this app (see `CLAUDE.md`'s security model — the server-side checks are
the entire boundary), this keeps a third-party IdP out of the admin blast
radius completely. A compromised LINE account can then reach a customer's own
order history and nothing else.

### 3.2 Sign-in flow

```
┌─────────┐  "Continue with LINE"   ┌──────────────────┐
│ Browser │ ───────────────────────▶│ /api/auth/signin │
└─────────┘                         │      /line       │
                                    └────────┬─────────┘
                                             │ 302 (state)
                                             ▼
                                   ┌──────────────────────┐
                                   │ access.line.me       │
                                   │ consent (profile,    │
                                   │ openid)              │
                                   └──────────┬───────────┘
                                              │ code + state
                                              ▼
                              ┌────────────────────────────────┐
                              │ /api/auth/callback/line        │
                              │ Auth.js verifies id_token      │
                              │ (HS256, client secret)         │
                              └───────────────┬────────────────┘
                                              │ profile { sub, name, picture }
                                              ▼
                              ┌────────────────────────────────┐
                              │ jwt callback                   │
                              │  find users by line_user_id    │
                              │        │                       │
                              │   found?├─no─▶ insert customer │
                              │        │       role=customer   │
                              │       yes      emailVerifiedAt │
                              │        │       = now()         │
                              │        ▼                       │
                              │  token.id   = OUR uuid         │
                              │  token.role = row.role         │
                              └───────────────┬────────────────┘
                                              ▼
                                   phone on file ? ──no──▶ /account/profile
                                              │yes             (complete it)
                                              ▼
                                    loginDestination(...)
```

Failure paths: user declines consent → LINE returns `error=access_denied`,
Auth.js redirects to `/login?error=...`; the login page must render a real
message rather than a silent no-op. A `state` mismatch → Auth.js rejects
before any callback of ours runs. A row insert failure → surface as a failed
sign-in, never a half-created session.

### 3.3 Schema changes (one migration)

```sql
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "line_user_id" text;
ALTER TABLE "users" ADD CONSTRAINT "users_line_user_id_unique" UNIQUE("line_user_id");
-- Every row must retain at least one way to authenticate.
ALTER TABLE "users" ADD CONSTRAINT "users_auth_method_check"
  CHECK ("password_hash" IS NOT NULL OR "line_user_id" IS NOT NULL);
```

Postgres `UNIQUE` permits multiple NULLs, so both `email` and `line_user_id`
can stay unique while being absent on the rows that don't use them.

Per `CLAUDE.md`: edit `src/db/schema.ts`, run `npm run db:generate`, and never
hand-edit what Drizzle produces. The `CHECK` constraint is the kind of thing
Drizzle can't model from the column builders — it belongs in
`drizzle/0001_init_extras.sql`, a journaled `--custom` migration applied
automatically by `npm run db:migrate`.

Optional, decide at build time: `avatar_url text` for LINE's `picture`.

### 3.4 Downstream relaxations

- **`submitCheckout`** — drop `|| !user.email` from the guard; use
  `customerName: user.name || user.email || "LINE"` and
  `customerEmail: user.email ?? null` (column already nullable).
- **Profile completion** — a LINE customer still needs a phone and address to
  check out. `customerProfileSchema` already requires a unique normalized
  phone, so the work is a redirect for LINE users who have none yet, not new
  validation.
- **`authorize`** — reject a row whose `passwordHash` is null explicitly,
  rather than relying on the dummy-hash fallback to make the comparison fail.
- **`/admin/users`** — add a "login method" column (password / LINE / both).
  Cheap, and it is the screen the owner will use to work out why a given
  customer cannot sign in.

## 4. Phases

- [ ] **Phase 1 — LINE channel + env (no code).**
      Create a LINE Login channel at developers.line.biz. Callback URL
      `https://<domain>/api/auth/callback/line` (and
      `http://localhost:3000/api/auth/callback/line` for dev — LINE allows
      localhost over http, everything else must be https). Add
      `AUTH_LINE_ID` / `AUTH_LINE_SECRET` to `.env.example`, `.env.local`, and
      Railway. **`AUTH_URL` must be correct in every environment** or the
      callback will mismatch.
- [ ] **Phase 2 — schema migration.** §3.3. Includes the `_extras` CHECK.
- [ ] **Phase 3 — auth wiring.** Provider registration, `jwt` callback
      `sub` → UUID mapping with create-on-first-login, explicit null-hash
      rejection in `authorize`, `emailVerifiedAt` set at creation (LINE has
      already verified the identity; the customer login gate in `src/auth.ts`
      must not lock out an account that never had an email).
- [ ] **Phase 4 — login UI.** "Continue with LINE" on `/login` and
      `/register`; strings into the `auth` namespace of
      `src/messages/{th,en}.json` (`auth` is already in `PUBLIC_NAMESPACES`,
      so no layout change). Render the `?error=` cases.
- [ ] **Phase 5 — checkout + profile.** §3.4.
- [ ] **Phase 6 — admin users page.** Login-method column.
- [ ] **Phase 7 — docs + tests.** A `## LINE Login` flow in
      `docs/application-flow.md` (added to the Flow Index), the callback route
      in `docs/api-overview.md`, README features + env, and a note in
      `docs/health-check.md` if the new columns change the standing check.

## 5. Open decisions

1. **Apply for LINE's email permission?** Recommendation: **no.** Phase 5
   makes email optional regardless, which is strictly more robust than
   depending on a permission the user can decline at the consent screen.
2. **Let an existing password customer link LINE later?** Worth having
   eventually, but only as an explicit action from a signed-in session (§3.1).
   Reasonable to defer past v1.
3. **Store `avatar_url`?** Only if the storefront account menu will show it.

## 6. Naming trap — two different LINE things

`shop_settings.line_id` **already exists** and is the shop's LINE **Official
Account**, used to build the contact-handoff deep link in
`src/db/queries/settings.ts`'s `contactLinks()`. That is unrelated to a LINE
**Login channel**. Do not reuse the value, the column, or the env var name.
The login credentials are new and separate (`AUTH_LINE_ID` /
`AUTH_LINE_SECRET`).

## 7. Testing notes

The OAuth round trip cannot be exercised locally until Phase 1 exists — there
is no LINE channel to redirect to. The Playwright harness can cover the login
page rendering the button, and the post-callback session state once a real
channel is configured, but not the redirect to `access.line.me` itself. Plan
for Phase 1 to be genuinely first.

Once wired, the highest-value regression checks are:

- A LINE-created row lands with `role = 'customer'` — never `owner`/`staff`.
- `orders.customerId` on a LINE customer's order is **our** UUID, not LINE's
  `sub`. (This is the single most likely bug in the whole feature.)
- A password account and a LINE account sharing an email stay **separate**.
- The `CHECK` constraint rejects an update that would strip a row's last
  authentication method.

---

## 8. Progress — what the optional-email change already delivered (2026-09-06)

Making the register form phone-first with an optional email (a separate
request) landed a meaningful slice of this plan early. Already done:

- **`users.email` is nullable** — migration `0006_yielding_the_hand`. This was
  half of §3.3.
- **`submitCheckout` no longer requires an email** and stores
  `customerEmail: user.email || null`, with `customerName` falling back down
  a real chain. This was most of §3.4's checkout item.
- **The customer login gate is already email-aware** —
  `user.email && !user.emailVerifiedAt` in `src/auth.ts`. §3.4's third bullet
  is done, and the "email-less customer locked out forever" trap this plan
  warned about is now closed for *any* future path, LINE included.
- **`/admin/users` already handles an absent email** (falls back to a "No
  email" label; `sendUserPasswordReset` returns `no_email`).
- **The profile and checkout screens render an absent email as `—`.**

### Still outstanding for LINE

- `users.password_hash` → nullable, plus the `CHECK (password_hash IS NOT NULL
  OR line_user_id IS NOT NULL)` constraint (§3.3).
- `users.line_user_id text UNIQUE` (§3.3).
- Everything in Phases 1, 3, 4, 6, 7.
- The profile-completion redirect (§3.4, second bullet) — still needed, since
  a LINE user arrives with no phone at all, whereas a phone-first signup
  always has one.

Net effect: **Phase 2 is roughly half done and Phase 5 is roughly done.**
The remaining schema work is additive and does not revisit anything above.
