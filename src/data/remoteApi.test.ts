import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRealtimeSocketUrl, requestRemoteEmailCode, submitRemoteFeedback } from "./remoteApi";

describe("remote API errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves JSON API error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ error: "Email delivery rejected this address." }), { status: 400 })
      )
    );

    await expect(requestRemoteEmailCode("buyer@foxmail.com")).rejects.toThrow(
      "Email delivery rejected this address."
    );
  });

  it("maps non-JSON gateway failures to an actionable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 })));

    await expect(requestRemoteEmailCode("buyer@foxmail.com")).rejects.toThrow(
      "Service is temporarily unavailable. Try again in a few minutes."
    );
  });

  it("builds same-origin realtime WebSocket URLs", () => {
    expect(buildRealtimeSocketUrl({ protocol: "https:", host: "resell.example" })).toBe(
      "wss://resell.example/api/realtime"
    );
    expect(buildRealtimeSocketUrl({ protocol: "http:", host: "localhost:8791" })).toBe(
      "ws://localhost:8791/api/realtime"
    );
  });

  it("posts feedback to the same-origin API with credentials", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "feedback-1", status: "submitted", createdAt: "2026-06-01T00:00:00.000Z" })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitRemoteFeedback({
        category: "bug",
        severity: "medium",
        summary: "Search filters reset",
        details: "The selected category disappears after refresh.",
        contactAllowed: false,
        sourceView: "browse",
        pageUrl: "https://loopvoro.com/",
        locale: "en",
        dataSource: "cloudflare"
      })
    ).resolves.toMatchObject({ id: "feedback-1", status: "submitted" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.stringContaining("Search filters reset")
      })
    );
  });
});
