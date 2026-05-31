import { describe, expect, it } from "vitest";
import { updateCurrentUserProfile } from "./auth";
import type { Env } from "./db";

type FakeStatement = {
  sql: string;
  args: unknown[];
  bind: (...args: unknown[]) => FakeStatement;
  run: () => Promise<{ meta: { changes: number } }>;
};

function createEnv() {
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
        async run() {
          return { meta: { changes: 1 } };
        }
      };
      statements.push(statement);
      return statement;
    }
  };
  return { env: { DB: db } as unknown as Env, statements };
}

describe("auth profile updates", () => {
  it("preserves seller setup fields when ordinary profile edits omit them", async () => {
    const { env, statements } = createEnv();

    await updateCurrentUserProfile(env, "seller-1", {
      displayName: "Avery Chen",
      bio: "Updated bio",
      pickupArea: "Brooklyn"
    });

    const update = statements.find((statement) => statement.sql.includes("UPDATE users"));
    expect(update?.sql).toContain("cancellation_policy = CASE WHEN ? THEN ? ELSE cancellation_policy END");
    expect(update?.sql).toContain(
      "off_platform_instructions = CASE WHEN ? THEN ? ELSE off_platform_instructions END"
    );
    expect(update?.args.slice(13, 19)).toEqual([0, "", 0, "", 0, ""]);
  });

  it("writes seller setup fields when seller setup is submitted", async () => {
    const { env, statements } = createEnv();

    await updateCurrentUserProfile(env, "seller-1", {
      displayName: "Avery Chen",
      bio: "Updated bio",
      pickupArea: "Brooklyn",
      cancellationPolicy: "Cancel early if plans change.",
      offPlatformInstructions: "Coordinate in chat.",
      responseExpectation: "Replies within one day."
    });

    const update = statements.find((statement) => statement.sql.includes("UPDATE users"));
    expect(update?.args.slice(13, 19)).toEqual([
      1,
      "Cancel early if plans change.",
      1,
      "Coordinate in chat.",
      1,
      "Replies within one day."
    ]);
    expect(update?.args[19]).toEqual(expect.any(String));
  });
});
