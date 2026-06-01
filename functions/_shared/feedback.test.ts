import { describe, expect, it, vi } from "vitest";
import { createFeedbackSubmission } from "./feedback";
import type { CurrentUser } from "./auth";
import type { Env } from "./db";

type FakeStatement = {
  sql: string;
  args: unknown[];
  bind: (...args: unknown[]) => FakeStatement;
  first: () => Promise<unknown>;
  run: () => Promise<{ meta: { changes: number } }>;
};

function createEnv(count = 0) {
  const statements: FakeStatement[] = [];
  const db = {
    prepare(sql: string) {
      const statement: FakeStatement = {
        sql,
        args: [],
        bind(...args: unknown[]) {
          statement.args = args;
          return statement;
        },
        async first() {
          if (sql.includes("COUNT(*)")) return { count };
          return null;
        },
        async run() {
          return { meta: { changes: 1 } };
        }
      };
      statements.push(statement);
      return statement;
    }
  };
  return {
    env: { DB: db as unknown as D1Database, FEEDBACK_HASH_SALT: "test-salt" } as Env,
    statements
  };
}

const user: CurrentUser = {
  id: "user-1",
  name: "Avery Chen",
  role: "buyer",
  email: "avery@example.com"
};

describe("feedback submissions", () => {
  it("persists validated feedback with authenticated user attribution", async () => {
    const { env, statements } = createEnv();

    const receipt = await createFeedbackSubmission(
      env,
      new Request("https://loopvoro.com/api/feedback", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.10",
          "user-agent": "Vitest"
        }
      }),
      user,
      {
        category: "bug",
        severity: "medium",
        summary: "Filters reset",
        details: "The category filter clears when I return to Browse.",
        contactAllowed: true,
        sourceView: "browse",
        locale: "en",
        dataSource: "cloudflare"
      }
    );

    const insert = statements.find((statement) => statement.sql.includes("INSERT INTO feedback_submissions"));
    expect(receipt).toMatchObject({ status: "submitted" });
    expect(insert?.args.slice(1, 8)).toEqual([
      "user-1",
      "avery@example.com",
      "bug",
      "medium",
      "Filters reset",
      "The category filter clears when I return to Browse.",
      "browse"
    ]);
    expect(insert?.args[14]).toEqual(expect.any(String));
  });

  it("rejects blank summaries and details before insert", async () => {
    const { env, statements } = createEnv();

    await expect(
      createFeedbackSubmission(env, new Request("https://loopvoro.com/api/feedback"), undefined, {
        category: "suggestion",
        severity: "low",
        summary: " ",
        details: " ",
        contactAllowed: false,
        sourceView: "browse"
      })
    ).rejects.toThrow("Add a short feedback summary.");

    expect(statements.some((statement) => statement.sql.includes("INSERT INTO feedback_submissions"))).toBe(false);
  });

  it("rate limits repeated submissions by user or IP hash", async () => {
    const { env } = createEnv(5);

    await expect(
      createFeedbackSubmission(
        env,
        new Request("https://loopvoro.com/api/feedback", {
          headers: { "cf-connecting-ip": "203.0.113.10" }
        }),
        user,
        {
          category: "trust",
          severity: "medium",
          summary: "Need better trust badge copy",
          details: "The profile trust language is not clear enough.",
          contactAllowed: false,
          sourceView: "browse"
        }
      )
    ).rejects.toThrow("Too many feedback submissions.");
  });
});
