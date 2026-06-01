---
name: resell-feedback-to-github-issues
description: Use when triaging Resell Platform user feedback into GitHub issues, including D1 inspection, privacy redaction, dedupe, labels, retries, and deployment checks.
---

# Feedback To GitHub Issues

Use this workflow for the periodic feedback triage loop. The website stores feedback in D1 first; GitHub issue creation runs from scheduled Worker maintenance.

## Rules

- Do not create issues directly from browser-submitted requests.
- Redact emails, phone numbers, exact addresses, cookies, auth headers, tokens, verification codes, and unnecessary chat text before copying feedback into GitHub.
- Search open issues before manually creating or retrying a feedback issue.
- Prefer one issue per distinct product/code change. Link duplicate feedback rows to the same issue when appropriate.
- Keep D1 migrations additive and idempotent.

## Required Configuration

Pages Functions:

```bash
rtk npx wrangler pages secret put FEEDBACK_HASH_SALT --project-name resell-platform
```

Scheduled Worker:

```bash
rtk npx wrangler secret put GITHUB_TOKEN --config workers/realtime/wrangler.toml
```

`workers/realtime/wrangler.toml` sets `GITHUB_REPO`.

## Inspect Feedback

```bash
rtk npx wrangler d1 execute resell-platform-db --remote --command "SELECT id, category, severity, source_view, status, github_issue_url, created_at FROM feedback_submissions ORDER BY created_at DESC LIMIT 20"
```

## Retry Failed Triage

Review the error first:

```bash
rtk npx wrangler d1 execute resell-platform-db --remote --command "SELECT id, github_error FROM feedback_submissions WHERE status = 'triage_failed' ORDER BY updated_at DESC LIMIT 10"
```

Then reset only selected rows:

```bash
rtk npx wrangler d1 execute resell-platform-db --remote --command "UPDATE feedback_submissions SET status = 'submitted', github_error = NULL, updated_at = datetime('now') WHERE id = '<feedback-id>' AND status = 'triage_failed'"
```

## Label Conventions

- Always: `feedback`
- Category: `feedback:bug`, `feedback:suggestion`, `feedback:listing`, `feedback:handoff`, `feedback:safety`, `feedback:trust`
- Type: `bug`, `enhancement`, `safety`
- Surface: `surface:browse`, `surface:sell`, `surface:orders`, `surface:chat`, `surface:notifications`
- Priority: `priority:high` for blocking and safety concerns

## Verification

```bash
rtk npm run test
rtk npm run typecheck
rtk npm run build
rtk npm run cf:d1:migrate:local
```

Before deploy, confirm the feedback migration is applied remotely and the Worker secret exists. After deploy, submit one low-severity test feedback row and confirm it reaches `feedback_submissions`.
