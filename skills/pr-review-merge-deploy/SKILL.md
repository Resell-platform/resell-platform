---
name: resell-pr-review-merge-deploy
description: Use when reviewing, merging, and deploying a pull request in this repo, including the standard branch, test, typecheck, build, PR review, merge, deploy, and smoke-check flow using rtk commands.
---

# PR Review, Merge, Deploy

Run from the repo root. Prefix shell commands with `rtk`.

## Review

```bash
rtk gh pr view <number> --json number,state,mergeable,url,headRefName,baseRefName
rtk gh pr diff <number>
rtk gh pr checks <number>
rtk git status --short --branch
```

GitHub checks may be absent for this repo. If `gh pr checks` says no checks are reported, rely on local verification and say that explicitly.

Review stance:

- Lead with blocking findings if any.
- Check data model, auth/session safety, Cloudflare bindings, migrations, and frontend mobile/desktop impact.
- Do not merge if tests fail, build fails, or the PR is not mergeable unless the user explicitly overrides.

## Local Verification

```bash
rtk npm run test
rtk npm run typecheck
rtk npm run build
rtk git diff --check
```

For frontend behavior, run a local server when useful:

```bash
rtk npm run dev -- --host 127.0.0.1 --port 5173
rtk curl -sS -I http://127.0.0.1:5173/
```

Stop the local server before finishing.

## Merge

```bash
rtk gh pr merge <number> --squash --delete-branch
rtk git status --short --branch
rtk git log -1 --oneline
rtk gh pr view <number> --json state,mergedAt,mergeCommit,url
```

Expected success signals:

- PR state is `MERGED`.
- Local branch is `main...origin/main`.
- Worktree is clean.
- Latest commit is the PR squash merge.

## Deploy And Smoke

```bash
PREVIEW_URL="https://<hash>.resell-platform.pages.dev"
rtk npm run deploy
rtk curl -sS -I https://loopvoro.com/
rtk curl -sS -I "$PREVIEW_URL/"
rtk curl -sS -o /private/tmp/loopvoro-state-pr.json https://loopvoro.com/api/state
rtk curl -sS -o /private/tmp/preview-state-pr.json "$PREVIEW_URL/api/state"
```

Summarize final result with:

- PR URL and merge commit.
- Production URL and preview URL.
- Verification commands and pass/fail result.
- Any caveat, such as missing GitHub checks or unavailable browser automation.
