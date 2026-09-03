# Scheduled Tasks

**There are no scheduled jobs in this repository.** No cron expression, no
background worker, no queue consumer, and no platform-specific scheduled
function exists anywhere in `src/` or the repo root. This file exists to
record that absence deliberately, so a future contributor doesn't add one
back under the assumption it was simply forgotten.

## Why not

The service this app was modelled on, `carstockpro`, runs a keepalive cron
because its database (Supabase, free tier) *pauses* the project after a
period of inactivity and needs periodic pinging to stay reachable.

**This app's database is Railway Postgres, and Railway Postgres is
always-on — it does not pause or suspend at all,** so there is no "someone
has to actively resume this" state for a cron job to defend against. There
is no autosuspend cold-start latency to reason about either: the connection
pool (`src/db/index.ts`) opens once when the app's long-lived container
starts and stays warm for the container's lifetime. See
`docs/health-check.md` for the fuller explanation of why this also means
there is no health/keepalive endpoint.

Everything else that might look like a candidate for a scheduled job in a
shop app — order-status transitions, low-stock notifications, inventory
reconciliation — is deliberately **manual** in this app (see `CLAUDE.md`'s
"manual stock is deliberate" note): the owner is a single person managing
their own shop, and there is no order→stock decrement, no automated
notification pipeline, and no batch reconciliation job to schedule.

If a real scheduled need appears in the future (e.g. a daily digest email,
a stale-draft cleanup job), add it here with the standard template — cron
expression, plain-English translation, and an ASCII execution-path
flowchart — rather than reaching for an ad-hoc `setInterval` or a
platform-specific trigger that ties the app back to one host.
