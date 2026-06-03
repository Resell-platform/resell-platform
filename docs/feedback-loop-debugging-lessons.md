# Feedback Loop Debugging Lessons

## What Happened

The feedback loop is intentionally asynchronous:

1. The web app posts feedback to `/api/feedback`.
2. Cloudflare Pages Functions validate and store a `feedback_submissions` row in D1.
3. The `resell-platform-realtime` Worker scheduled task scans submitted rows.
4. The Worker creates GitHub issues and writes the issue URL back to D1.

The D1 submission path worked immediately. Feedback rows were present with `status = 'submitted'`, but no GitHub issues appeared and the rows did not move to `processing`, `triage_failed`, or `issue_created`.

## Why It Took Time

The first symptom looked like a cron or Worker deployment problem because rows were not even claimed. The deployed Worker had a cron trigger, a D1 binding, and a `GITHUB_TOKEN` secret name, so the control-plane configuration looked correct.

The missing clue was that the secret name existed but the secret value was empty at runtime. The command form that was initially used with `rtk` did not pass the intended stdin value through to `wrangler secret put`, so Cloudflare stored a present-but-empty `GITHUB_TOKEN`. The Worker therefore skipped feedback triage before querying D1.

After `GITHUB_TOKEN` was uploaded with a real value, the pipeline advanced to GitHub and failed with:

```text
403 Forbidden
Resource not accessible by personal access token
```

That second failure was a GitHub fine-grained token authorization issue. The token needed explicit access to the `Resell-platform/resell-platform` repository and `Issues: Read and write` permission.

## Lesson

For asynchronous infrastructure, a green deployment is not the same as a working pipeline. Verify each boundary with observable state:

- API accepted the request.
- D1 contains the expected row.
- The Worker runtime sees required secrets and vars.
- The Worker selects and claims rows.
- The external service accepts the token.
- The final database linkage is written.

Also, do not treat `wrangler secret list` as proof that a secret is usable. It proves the name exists, not that the runtime value is non-empty or authorized for the downstream API.

## Operational Fixes

The realtime Worker now exposes a protected maintenance endpoint:

```text
POST /internal/maintenance/run
```

It uses `MAINTENANCE_TOKEN` and returns structured counts:

```json
{
  "feedback": {
    "skipped": false,
    "missingConfig": [],
    "selected": 3,
    "claimed": 3,
    "created": 3,
    "failed": 0,
    "claimMissed": 0
  }
}
```

This gives us a deterministic way to verify the same maintenance function used by cron.

Secrets that are provided through stdin should use `rtk proxy` so Wrangler receives the secret value directly:

```bash
read -s "GITHUB_TOKEN_VALUE?Paste GitHub token: "
printf "\n"
printf "%s" "$GITHUB_TOKEN_VALUE" | rtk proxy npx wrangler secret put GITHUB_TOKEN --config workers/realtime/wrangler.toml
unset GITHUB_TOKEN_VALUE
```

Required GitHub token settings:

```text
Repository access: Resell-platform/resell-platform
Repository permissions: Issues: Read and write
```

## Verification Checklist

Run maintenance:

```bash
TOKEN=$(cat /private/tmp/resell-maintenance-token)
rtk curl -sS -X POST https://resell-platform-realtime.xlu-agentic-systems.workers.dev/internal/maintenance/run \
  -H "Authorization: Bearer $TOKEN"
```

Inspect D1:

```bash
rtk npx wrangler d1 execute resell-platform-db --remote --command \
  "SELECT id, status, github_issue_number, github_issue_url, github_error, triaged_at FROM feedback_submissions ORDER BY created_at DESC LIMIT 5"
```

Expected result:

```text
status = issue_created
github_issue_url is not null
github_error is null
```
