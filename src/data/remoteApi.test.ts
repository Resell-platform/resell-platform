import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRealtimeSocketUrl, requestRemoteEmailCode } from "./remoteApi";

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
});
