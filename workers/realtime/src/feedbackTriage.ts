type FeedbackTriageEnv = {
  DB: D1Database;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
};

type FeedbackRow = {
  id: string;
  user_id?: string | null;
  contact_email?: string | null;
  category: string;
  severity: string;
  summary: string;
  details: string;
  source_view: string;
  entity_type?: string | null;
  entity_id?: string | null;
  page_url?: string | null;
  locale?: string | null;
  data_source?: string | null;
  github_issue_url?: string | null;
  created_at: string;
};

type GitHubIssueResponse = {
  number: number;
  html_url: string;
};

const BATCH_SIZE = 10;
const MAX_ERROR_LENGTH = 500;

export async function triageFeedbackSubmissions(env: FeedbackTriageEnv, now = new Date()) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.warn("Skipping feedback triage; GITHUB_TOKEN or GITHUB_REPO is not configured.");
    return;
  }

  const rows = await env.DB.prepare(
    `SELECT *
     FROM feedback_submissions
     WHERE status = 'submitted'
       AND github_issue_url IS NULL
     ORDER BY created_at
     LIMIT ?`
  )
    .bind(BATCH_SIZE)
    .all<FeedbackRow>();

  for (const row of rows.results) {
    await triageFeedbackRow(env, row, now);
  }
}

async function triageFeedbackRow(env: FeedbackTriageEnv, row: FeedbackRow, now: Date) {
  const timestamp = now.toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE feedback_submissions
     SET status = 'processing', updated_at = ?
     WHERE id = ?
       AND status = 'submitted'
       AND github_issue_url IS NULL`
  )
    .bind(timestamp, row.id)
    .run();
  if (!claimed.meta.changes) return;

  const labels = classifyFeedback(row);
  const body = buildIssueBody(row);

  try {
    const issue = await createGitHubIssue(env, {
      title: buildIssueTitle(row),
      body,
      labels
    });
    await env.DB.prepare(
      `UPDATE feedback_submissions
       SET status = 'issue_created',
           triage_summary = ?,
           triage_labels = ?,
           github_issue_number = ?,
           github_issue_url = ?,
           github_error = NULL,
           triaged_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(row.summary, labels.join(","), issue.number, issue.html_url, timestamp, timestamp, row.id)
      .run();
  } catch (error) {
    await env.DB.prepare(
      `UPDATE feedback_submissions
       SET status = 'triage_failed',
           github_error = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(toBoundedError(error), timestamp, row.id)
      .run();
  }
}

function classifyFeedback(row: FeedbackRow) {
  const labels = new Set(["feedback"]);
  const categoryLabel: Record<string, string> = {
    bug: "bug",
    suggestion: "enhancement",
    listing: "surface:listings",
    handoff: "surface:handoffs",
    safety: "safety",
    trust: "surface:trust"
  };
  labels.add(categoryLabel[row.category] ?? "needs-triage");
  labels.add(`feedback:${row.category}`);
  labels.add(`severity:${row.severity}`);

  if (row.source_view) labels.add(`surface:${row.source_view}`);
  if (row.severity === "blocking" || row.severity === "safety") labels.add("priority:high");

  return Array.from(labels);
}

function buildIssueTitle(row: FeedbackRow) {
  const summary = redact(row.summary).replace(/\s+/g, " ").trim();
  return `Feedback: ${summary}`.slice(0, 120);
}

function buildIssueBody(row: FeedbackRow) {
  const context = [
    `Feedback ID: ${row.id}`,
    `Category: ${row.category}`,
    `Severity: ${row.severity}`,
    `Source view: ${row.source_view}`,
    row.entity_type && row.entity_id ? `Entity: ${row.entity_type}/${row.entity_id}` : "",
    row.locale ? `Locale: ${row.locale}` : "",
    row.data_source ? `Data source: ${row.data_source}` : "",
    row.page_url ? `Page: ${redact(row.page_url)}` : "",
    `Submitted: ${row.created_at}`
  ].filter(Boolean);

  return [
    "## User feedback",
    redact(row.details),
    "",
    "## Context",
    ...context.map((item) => `- ${item}`),
    "",
    "## Acceptance criteria",
    "- [ ] Review and classify the feedback.",
    "- [ ] Decide whether this needs a product, UX, or engineering change.",
    "- [ ] Add reproduction steps or implementation notes before starting work."
  ].join("\n");
}

async function createGitHubIssue(
  env: FeedbackTriageEnv,
  issue: {
    title: string;
    body: string;
    labels: string[];
  }
): Promise<GitHubIssueResponse> {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "resell-platform-feedback-triage",
      "x-github-api-version": "2022-11-28"
    },
    body: JSON.stringify(issue)
  });

  if (!response.ok) {
    throw new Error(`GitHub issue creation failed with ${response.status}`);
  }

  return (await response.json()) as GitHubIssueResponse;
}

function redact(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted phone]")
    .replace(/\b(?:token|secret|password|cookie|authorization)=\S+/gi, "[redacted secret]");
}

function toBoundedError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown feedback triage error";
  return message.slice(0, MAX_ERROR_LENGTH);
}
