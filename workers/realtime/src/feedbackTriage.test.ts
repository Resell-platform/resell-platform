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

    const result = await triageFeedbackSubmissions(
      {
        DB: db,
        GITHUB_TOKEN: "ghs_test",
        GITHUB_REPO: "org/repo"
      },
      new Date("2026-06-01T00:05:00.000Z")
    );

    expect(result).toMatchObject({ selected: 1, claimed: 1, created: 1, failed: 0, claimMissed: 0 });
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

  it("reports missing GitHub config without querying D1", async () => {
    const prepare = vi.fn();

    const result = await triageFeedbackSubmissions({
      DB: { prepare } as unknown as D1Database,
      GITHUB_REPO: "org/repo"
    });

    expect(result).toMatchObject({
      skipped: true,
      missingConfig: ["GITHUB_TOKEN"],
      selected: 0,
      claimed: 0,
      created: 0,
      failed: 0,
      claimMissed: 0
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("stores GitHub response details when issue creation fails", async () => {
    const { db, statements } = createDb();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "Resource not accessible by personal access token" }), {
          status: 403,
          statusText: "Forbidden",
          headers: { "x-github-request-id": "ABC:123" }
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await triageFeedbackSubmissions(
      {
        DB: db,
        GITHUB_TOKEN: "ghs_test",
        GITHUB_REPO: "org/repo"
      },
      new Date("2026-06-01T00:05:00.000Z")
    );

    expect(result).toMatchObject({ selected: 1, claimed: 1, created: 0, failed: 1, claimMissed: 0 });
    const failureUpdate = statements.find((statement) => statement.sql.includes("github_error"));
    expect(failureUpdate?.args[0]).toContain("GitHub issue creation failed with 403");
    expect(failureUpdate?.args[0]).toContain("Resource not accessible by personal access token");
    expect(failureUpdate?.args[0]).toContain("request_id=ABC:123");
  });
});
