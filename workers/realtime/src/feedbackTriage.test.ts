import { afterEach, describe, expect, it, vi } from "vitest";
import { triageFeedbackSubmissions } from "./feedbackTriage";

type FakeStatement = {
  sql: string;
  args: unknown[];
  bind: (...args: unknown[]) => FakeStatement;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

function createDb() {
  const statements: FakeStatement[] = [];
  const row = {
    id: "feedback-1",
    user_id: "user-1",
    category: "bug",
    severity: "blocking",
    summary: "Chat composer freezes",
    details: "The chat composer freezes after I paste a phone number 555-123-4567.",
    source_view: "chat",
    entity_type: "reservation",
    entity_id: "reservation-1",
    page_url: "https://loopvoro.com/?token=secret",
    locale: "en",
    data_source: "cloudflare",
    created_at: "2026-06-01T00:00:00.000Z"
  };
  const db = {
    prepare(sql: string) {
      const statement: FakeStatement = {
        sql,
        args: [],
        bind(...args: unknown[]) {
          statement.args = args;
          return statement;
        },
        async all() {
          if (sql.includes("FROM feedback_submissions")) return { results: [row] };
          return { results: [] };
        },
        async run() {
          return { meta: { changes: 1 } };
        }
      };
      statements.push(statement);
      return statement;
    }
  };
  return { db: db as unknown as D1Database, statements };
}

describe("feedback triage worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates GitHub issues from submitted feedback and stores linkage", async () => {
    const { db, statements } = createDb();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ number: 47, html_url: "https://github.com/org/repo/issues/47" }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await triageFeedbackSubmissions(
      {
        DB: db,
        GITHUB_TOKEN: "ghs_test",
        GITHUB_REPO: "org/repo"
      },
      new Date("2026-06-01T00:05:00.000Z")
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/org/repo/issues",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Chat composer freezes")
      })
    );
    const firstFetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const issueBody = JSON.parse(String(firstFetchCall[1].body)) as { body: string; labels: string[] };
    expect(issueBody.body).toContain("[redacted phone]");
    expect(issueBody.body).toContain("[redacted secret]");
    expect(issueBody.labels).toEqual(expect.arrayContaining(["feedback", "bug", "priority:high", "surface:chat"]));

    const issueUpdate = statements.find((statement) => statement.sql.includes("github_issue_number"));
    expect(issueUpdate?.args.slice(2, 4)).toEqual([47, "https://github.com/org/repo/issues/47"]);
  });
});
