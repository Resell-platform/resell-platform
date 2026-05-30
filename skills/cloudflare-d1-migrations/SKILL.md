---
name: resell-cloudflare-d1-migrations
description: Use when creating, applying, or reviewing Cloudflare D1 migrations for this repo, including local and remote commands, safety checks, schema verification, and the rule that migrations must be additive and idempotent unless explicitly approved.
---

# Cloudflare D1 Migrations

Run from the repo root. Prefix shell commands with `rtk`.

## Rules

- Default to additive, idempotent migrations.
- Do not drop, rename, or rewrite production data unless the user explicitly approves that destructive migration.
- Preserve existing listings, listing items, reservations, auth sessions, messages, and notifications.
- Backfills should be safe to rerun: use `IF NOT EXISTS`, `INSERT OR IGNORE`, guarded `UPDATE`, or equivalent.

## Create A Migration

Add a numbered SQL file under `migrations/`, for example:

```text
migrations/0005_descriptive_name.sql
```

Follow existing migration style:

- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- guarded backfills
- no environment-specific data

## Apply Locally

```bash
rtk npm run cf:d1:migrate:local
rtk npm run build
rtk npm run test
```

For Cloudflare local development:

```bash
rtk npm run dev:realtime
rtk npm run dev:cloudflare
```

`dev:cloudflare` serves the Pages app against local Wrangler state. The UI should show `Cloudflare D1`.

## Remote Safety Checklist

Before applying remote migrations:

```bash
rtk git status --short --branch
rtk npm run test
rtk npm run typecheck
rtk npm run build
```

Then review the SQL one more time for destructive operations and backfill idempotency.

## Apply Remotely

```bash
rtk npm run cf:d1:migrate:remote
```

Expected success signal: Wrangler reports the migration applied to `resell-platform-db` without SQL errors.

## Verify After Remote Migration

```bash
rtk curl -sS -o /private/tmp/loopvoro-state-after-migration.json https://loopvoro.com/api/state
rtk python3.12 -c "import json; data=json.load(open('/private/tmp/loopvoro-state-after-migration.json')); print({'users': len(data.get('users', [])), 'listings': len(data.get('listings', [])), 'items': sum(len(x.get('items', [])) for x in data.get('listings', [])), 'reservations': len(data.get('reservations', [])), 'messages': len(data.get('messages', []))})"
```

If the migration affects auth, listings, reservations, or messages, also run the relevant browser/API workflow before deploying unrelated changes.

