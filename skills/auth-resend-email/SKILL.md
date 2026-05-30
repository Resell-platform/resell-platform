---
name: resell-auth-resend-email
description: Use when configuring or debugging email-code login for this repo, including Resend env vars, expected sender domain, common Resend errors, and where secrets should be stored.
---

# Auth And Resend Email

Email login runs in Cloudflare Pages Functions. Localhost may return a development code in the API response, but production must use Resend.

## Required Variables

- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM`

Example format:

```text
AUTH_EMAIL_FROM=Resell <login@loopvoro.com>
```

`loopvoro.com` is the expected production sender domain if it has been verified in Resend. Do not use `resend.dev` for real recipients.

## Where Secrets Live

Production secrets belong in Cloudflare Pages project secrets, not committed files:

```bash
rtk npx wrangler pages secret put RESEND_API_KEY --project-name resell-platform
rtk npx wrangler pages secret put AUTH_EMAIL_FROM --project-name resell-platform
```

Local examples may live in `.dev.vars.example`; real local secrets may live in uncommitted local env files only.

Never commit real API keys.

## Common Errors

- `email login is not configured`: `RESEND_API_KEY` or `AUTH_EMAIL_FROM` is missing in the running environment.
- `Testing domain restriction`: Resend is using `resend.dev`, which can only send to the account owner address. Verify `loopvoro.com` in Resend and set `AUTH_EMAIL_FROM` to an address at that domain.
- `request failed with 502`: may be a transient Resend/API failure, but first check missing env vars, sender domain verification, and Cloudflare function logs.
- Bad sender address: `AUTH_EMAIL_FROM` must use a domain/address allowed by the Resend account.

## Verification

After setting or changing secrets:

```bash
rtk npm run deploy
rtk curl -sS -I https://loopvoro.com/
```

Then test the login request path from the app. If using API calls directly, avoid exposing real codes or secrets in the transcript.

