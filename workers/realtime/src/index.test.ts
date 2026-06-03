import { describe, expect, it, vi } from "vitest";
import worker from "./index";

function createIdleDb() {
  const prepare = vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn(() => statement),
      all: vi.fn(async () => ({ results: [] })),
      run: vi.fn(async () => ({ meta: { changes: 0 } }))
    };
    return statement;
  });

  return {
    DB: {
      prepare,
      batch: vi.fn(async () => [])
    } as unknown as D1Database,
    prepare
  };
}

describe("realtime worker maintenance endpoint", () => {
  it("is disabled when no maintenance token is configured", async () => {
    const { DB, prepare } = createIdleDb();

    const response = await worker.fetch(
      new Request("https://worker.test/internal/maintenance/run", { method: "POST" }),
      { DB, GITHUB_TOKEN: "ghs_test", GITHUB_REPO: "org/repo" }
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-resell-worker")).toBe("realtime-maintenance-v1");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects requests with the wrong bearer token", async () => {
    const { DB, prepare } = createIdleDb();

    const response = await worker.fetch(
      new Request("https://worker.test/internal/maintenance/run", {
        method: "POST",
        headers: { authorization: "Bearer wrong" }
      }),
      { DB, GITHUB_TOKEN: "ghs_test", GITHUB_REPO: "org/repo", MAINTENANCE_TOKEN: "secret" }
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("x-resell-worker")).toBe("realtime-maintenance-v1");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("runs scheduled maintenance for authorized requests", async () => {
    const { DB, prepare } = createIdleDb();

    const response = await worker.fetch(
      new Request("https://worker.test/internal/maintenance/run", {
        method: "POST",
        headers: { authorization: "Bearer secret" }
      }),
      { DB, GITHUB_TOKEN: "ghs_test", GITHUB_REPO: "org/repo", MAINTENANCE_TOKEN: "secret" }
    );
    const body = (await response.json()) as {
      ok: boolean;
      expiredReservations: number;
      feedback: { selected: number; skipped: boolean };
      failures: string[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("x-resell-worker")).toBe("realtime-maintenance-v1");
    expect(body).toMatchObject({
      ok: true,
      expiredReservations: 0,
      feedback: { selected: 0, skipped: false },
      failures: []
    });
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
