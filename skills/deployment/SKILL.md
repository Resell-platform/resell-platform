---
name: resell-deployment
description: Use when deploying this repo to Cloudflare Pages and the realtime Worker, including build commands, deploy commands, and post-deploy smoke checks for loopvoro.com, preview URLs, /api/state, and realtime Worker output.
---

# Resell Deployment

Run from the repo root. Prefix shell commands with `rtk`.

## Preflight

```bash
rtk git status --short --branch
rtk npm run test
rtk npm run typecheck
rtk npm run build
```

Do not deploy with uncommitted app changes unless the user explicitly asks for that state.

## Deploy

```bash
rtk npm run deploy
```

This runs:

```bash
npm run build
npm run deploy:realtime
wrangler pages deploy dist
```

Expected success signals:

- Vite build finishes with `✓ built`.
- Realtime Worker upload says `Deployed resell-platform-realtime triggers`.
- Worker URL is printed: `https://resell-platform-realtime.xlu-agentic-systems.workers.dev`.
- Pages deploy says `Deployment complete!` and prints a preview URL like `https://<hash>.resell-platform.pages.dev`.

## Post-Deploy Smoke

Set `PREVIEW_URL` to the URL printed by Wrangler, then run:

```bash
PREVIEW_URL="https://<hash>.resell-platform.pages.dev"
rtk curl -sS -I https://loopvoro.com/
rtk curl -sS -I "$PREVIEW_URL/"
rtk curl -sS -o /private/tmp/loopvoro-state.json https://loopvoro.com/api/state
rtk curl -sS -o /private/tmp/preview-state.json "$PREVIEW_URL/api/state"
rtk python3.12 -c "import json; data=json.load(open('/private/tmp/loopvoro-state.json')); print({'users': len(data.get('users', [])), 'listings': len(data.get('listings', [])), 'items': sum(len(x.get('items', [])) for x in data.get('listings', [])), 'reservations': len(data.get('reservations', []))})"
rtk python3.12 -c "import json; data=json.load(open('/private/tmp/preview-state.json')); print({'users': len(data.get('users', [])), 'listings': len(data.get('listings', [])), 'items': sum(len(x.get('items', [])) for x in data.get('listings', [])), 'reservations': len(data.get('reservations', []))})"
```

Expected success signals:

- Both HTML checks return `HTTP/2 200`.
- Both `/api/state` responses parse as JSON.
- State summary has plausible counts and no Python JSON parse error.

## Realtime Worker Smoke

Realtime deploy success is normally verified by the deploy output. The Worker root returns `404` by design; the useful app endpoint is `/api/realtime`, which requires a same-origin authenticated WebSocket upgrade. Do not treat a direct HTTP `404` from the Worker root as deploy failure.
