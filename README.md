# Resell Platform

MVP marketplace for seller listings with one or more included items, buyer reservations, seller-buyer chat, image uploads, pickup or handoff coordination, hold expiration, completion, and cancellation.

## Local Development

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173/ or the localhost URL Vite prints.

This mode uses browser `localStorage` as a fallback and does not require Cloudflare.

## Cloudflare Local Development

Apply the D1 migrations to the local Wrangler database and run the Pages app with Functions:

```bash
npm run cf:d1:migrate:local
npm run dev:realtime
# in a second terminal
npm run dev:cloudflare
```

Open http://localhost:8788/. The app will show `Cloudflare D1` when it is using the D1-backed API instead of local fallback storage.

## Verification

```bash
npm run test
npm run typecheck:functions
npm run build
```

## Current MVP

- Seller can publish listings with 1-6 uploaded images and one or more item rows after completing seller setup.
- Buyers can browse listings with structured filters, reserve an available listing, and open a reservation-scoped chat with the seller.
- Reservations support cancellation reasons and a lightweight handoff plan for pickup or shipping coordination.
- Cloudflare mode supports email-code account login, HttpOnly session cookies, editable profiles, and email/phone trust badge fields.
- The H5/PWA web app supports English and Mandarin UI chrome for core marketplace workflows.
- The H5/PWA web app now uses typed platform adapters for login, share, browser notifications, image upload, deep links, and reservation coordination.
- Logged-in users can export their account, seller listings, listing items, reservations, chat messages, notifications, trust badges, and moderation model metadata as JSON.
- Reservation holds expire 24 hours after reservation. `/api/state` and the scheduled realtime Worker create idempotent buyer/seller hold-expiration notifications.
- Plain local demo users can be switched from the left navigation on desktop. Cloudflare mode uses account login instead.

## Current Limits

- `npm run dev` still uses browser `localStorage`; use `npm run dev:cloudflare` to exercise D1.
- Email-code delivery uses Resend in Cloudflare mode with a per-email cooldown and hourly limit. Localhost returns the development code in the API response for testing.
- Seed demo images are stored as data URLs for portability. New Cloudflare listing uploads are written to R2 and D1 stores the served image path plus R2 key.
- Hold expiration checks run from both `/api/state` and the scheduled realtime Worker. In-app notifications remain the canonical history.
- There is no moderation, production SMS provider, or external email notification delivery yet. Phone verification is modeled as an optional trust badge field.

## Cloudflare Deployment

The repository is configured for Cloudflare Pages Functions, D1, and R2:

- Build command: `npm run build`
- Output directory: `dist`
- Node version: `22.12.0` or newer
- Pages Functions directory: `functions`
- D1 binding: `DB`
- Durable Object Worker: `resell-platform-realtime`
- Durable Object binding: `CHAT_USER_HUB`
- R2 binding: `LISTING_IMAGES` after R2 is enabled on the Cloudflare account
- Required auth secrets/env vars: `RESEND_API_KEY`, `AUTH_EMAIL_FROM`

Create the Cloudflare resources:

```bash
npm run cf:d1:create
# optional after R2 is enabled in the Cloudflare dashboard
npm run cf:r2:create
```

Copy the returned D1 database ID into `wrangler.toml`, replacing:

```text
00000000-0000-0000-0000-000000000000
```

Apply the remote migrations:

```bash
npm run cf:d1:migrate:remote
```

Configure Resend before deploying email login:

```bash
npx wrangler pages secret put RESEND_API_KEY --project-name resell-platform
npx wrangler pages secret put AUTH_EMAIL_FROM --project-name resell-platform
```

`AUTH_EMAIL_FROM` must be a sender address allowed by the Resend account, for example `Resell <login@your-verified-domain.com>`.

Deploy the realtime Worker and Pages app:

```bash
npm run deploy
```

## Cloudflare Architecture

- D1 stores profiles, auth challenges, auth sessions, listings, listing image metadata, reservations, chat messages, and notifications.
- Pages Functions expose email-code auth, `/api/me`, `/api/state`, `/api/listings`, `/api/reservations`, `/api/messages`, `/api/realtime`, reservation status updates, and notification read actions.
- Pages Functions expose `/api/export` for authenticated JSON export across the unified business models.
- Protected mutations derive the actor from the HttpOnly session cookie instead of trusting browser-submitted user IDs.
- Reservation creation updates listing availability in D1 with a conditional update, so a second buyer cannot reserve the same available item.
- Chat writes messages to D1 after checking the sender is the reservation buyer or seller, then broadcasts a realtime event through the per-user `ChatUserHub` Durable Object so connected tabs refresh immediately.
- When the `LISTING_IMAGES` R2 binding is configured, new listing uploads store image bytes in R2 and D1 stores the served image path plus R2 key.
- Until R2 is enabled, the Functions fallback stores uploaded image data URLs in D1 so the platform can still run with a real shared database.

## Product Architecture

- Backend layer: Cloudflare Pages Functions / Workers, D1, R2, Resend email login, HttpOnly sessions, and reservation handoff workflow.
- Business model layer: User/Profile, Listing, ListingImage, Reservation, ChatMessage, Notification, TrustBadge, and ModerationStatus.
- Frontend layer: current H5/PWA web app first; WeChat mini program, Xiaohongshu mini program, and Messenger WebView later.
- Platform adapter layer: `src/platform/adapters.ts` defines login, share, notification, image upload, deep link/open-in-app, and reservation coordination adapters. The current implementation targets H5/PWA; WeChat, Xiaohongshu, and Messenger can add platform-specific implementations against the same contracts.
