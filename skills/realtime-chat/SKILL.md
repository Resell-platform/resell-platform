---
name: resell-realtime-chat
description: Use when changing, testing, or debugging realtime chat in this repo, including the WebSocket flow, Cloudflare Durable Object Worker, local tests, fallback behavior, and smoke checks.
---

# Realtime Chat

Chat uses WebSockets through Cloudflare Pages Functions and a Durable Object Worker.

## Architecture

- Frontend builds a same-origin WebSocket URL with `buildRealtimeSocketUrl()` in `src/data/remoteApi.ts`.
- App connection and event merge logic live in `src/App.tsx`.
- Browser connects to `/api/realtime`.
- `functions/api/realtime.ts` requires:
  - WebSocket upgrade
  - same-origin request
  - authenticated current user
  - `CHAT_USER_HUB` binding
- `workers/realtime/src/index.ts` owns `ChatUserHub`, accepts WebSockets, and broadcasts JSON events.
- Chat messages are persisted through Pages Functions/D1 before realtime events are broadcast.

The Worker root returns `404` by design. `/api/realtime` returns `426` for normal HTTP because it requires WebSocket upgrade.

## Local Development

For local Cloudflare-mode testing:

```bash
rtk npm run cf:d1:migrate:local
rtk npm run dev:realtime
rtk npm run dev:cloudflare
```

Use two authenticated sessions/users when manually verifying cross-tab delivery.

## Automated Verification

```bash
rtk npm run test
rtk npm run typecheck
rtk npm run build
```

Relevant tests:

- `src/data/remoteApi.test.ts` for WebSocket URL construction.
- `src/App.test.tsx` for merging realtime message events without refetching state.
- `functions/_shared/db.test.ts` and store tests for message persistence and permissions.

## Deploy And Smoke

`rtk npm run deploy` deploys both the Pages app and the realtime Worker.

Expected deploy output:

- `Deployed resell-platform-realtime triggers`
- Worker URL printed
- Pages `Deployment complete!`

Post-deploy basic checks:

```bash
rtk curl -sS -I https://loopvoro.com/
rtk curl -sS -o /private/tmp/realtime-state.json https://loopvoro.com/api/state
```

For full realtime verification, use authenticated browser sessions and confirm a sent chat message appears without a manual refresh.

