import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { seedState } from "./data/seed";
import type { AppState, User } from "./data/types";

function installLocalStorage() {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
      get length() {
        return storage.size;
      }
    }
  });
}

describe("App user flows", () => {
  let webSocketMock: ReturnType<typeof installWebSocketMock>;

  beforeEach(() => {
    installLocalStorage();
    webSocketMock = installWebSocketMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("creates a listing after tracking multi-image upload and removal state", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const imageInput = screen.getByLabelText(/images/i);
    const files = [
      new File(["first"], "first.png", { type: "image/png" }),
      new File(["second"], "second.jpg", { type: "image/jpeg" })
    ];

    fireEvent.change(imageInput, { target: { files } });

    await waitFor(() => {
      expect(container.querySelectorAll(".upload-strip img")).toHaveLength(2);
    });

    const firstPreview = container.querySelector<HTMLButtonElement>(".upload-strip button");
    expect(firstPreview).not.toBeNull();
    fireEvent.click(firstPreview!);

    await waitFor(() => {
      expect(container.querySelectorAll(".upload-strip img")).toHaveLength(1);
    });

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Test lamp" } });
    fireEvent.change(screen.getByLabelText(/post price/i), { target: { value: "64" } });
    fireEvent.change(screen.getByLabelText(/pickup or shipping notes/i), {
      target: { value: "Porch pickup" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Brass desk lamp with working dimmer." }
    });
    fireEvent.change(screen.getByLabelText(/item name 1/i), { target: { value: "Brass desk lamp" } });
    fireEvent.change(screen.getByLabelText(/item price 1/i), { target: { value: "64" } });
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    fireEvent.change(screen.getByLabelText(/item name 2/i), { target: { value: "Bulb pack" } });
    fireEvent.change(screen.getByLabelText(/item price 2/i), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: /publish post/i }));

    expect(await screen.findAllByRole("heading", { name: "Test lamp" })).toHaveLength(2);
    expect(screen.getAllByText("$64")).not.toHaveLength(0);
    expect(screen.getByText("Porch pickup")).toBeInTheDocument();
    expect(screen.getAllByText("Brass desk lamp")).not.toHaveLength(0);
    expect(screen.getAllByText("Bulb pack")).not.toHaveLength(0);
  });

  it("creates a chat message from the rendered composer and clears the input", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    const composer = screen.getByPlaceholderText(/write a message/i);

    fireEvent.change(composer, { target: { value: "Pickup at 5?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Pickup at 5?")).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });

  it("does not show another buyer's reservation chat after switching users", () => {
    render(<App />);

    fireEvent.change(screen.getAllByLabelText(/demo user/i)[0], { target: { value: "buyer-2" } });
    fireEvent.click(screen.getByRole("button", { name: /chat/i }));

    expect(screen.getByText(/reserve a post to start/i)).toBeInTheDocument();
    expect(screen.queryByText(/i can pay today/i)).not.toBeInTheDocument();
  });

  it("clears unread notifications when marking them read", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /alerts/i }));
    expect(screen.getByRole("heading", { name: /payment overdue/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /mark read/i }));

    expect(screen.queryByRole("heading", { name: /payment overdue/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no unread notifications/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark read/i })).toBeDisabled();
  });

  it("keeps the primary mobile navigation visible in the rendered shell", () => {
    const { container } = render(<App />);

    const navigation = screen.getByLabelText(/primary navigation/i);

    for (const label of ["Browse", "Sell", "Picked", "Chat"]) {
      expect(within(navigation).getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
    expect(container.querySelector(".mobile-app-header .brand-mark")).toHaveAttribute("src", "/brand/icon-192.png");
  });

  it("keeps publish and edit listing workflows available for a mobile viewport", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    fireEvent.change(screen.getByLabelText(/images/i), {
      target: { files: [new File(["mobile"], "mobile.png", { type: "image/png" })] }
    });
    await waitFor(() => {
      expect(container.querySelectorAll(".upload-strip img")).toHaveLength(1);
    });
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Mobile floor lamp" } });
    fireEvent.change(screen.getByLabelText(/post price/i), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText(/pickup or shipping notes/i), {
      target: { value: "Lobby pickup" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Slim lamp tested from a phone-sized layout." }
    });
    fireEvent.change(screen.getByLabelText(/item name 1/i), { target: { value: "Slim floor lamp" } });
    fireEvent.click(screen.getByRole("button", { name: /publish post/i }));

    expect(await screen.findAllByRole("heading", { name: "Mobile floor lamp" })).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const deskRow = screen.getByText("Walnut writing desk").closest(".listing-management-row");
    expect(deskRow).not.toBeNull();
    fireEvent.click(within(deskRow as HTMLElement).getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/edit price for walnut writing desk/i), {
      target: { value: "199" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText(/\$199/)).not.toHaveLength(0);
  });

  it("switches the main web interface between English and Mandarin", () => {
    render(<App />);

    fireEvent.change(screen.getAllByLabelText(/language/i)[0], { target: { value: "zh" } });

    expect(screen.getByRole("button", { name: /浏览/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /出售/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /从本地卖家处选购商品/i })).toBeInTheDocument();
  });

  it("lets the local seller manage listing status from My listings", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const deskStatus = screen.getByLabelText(/status for walnut writing desk/i);

    expect(deskStatus).toHaveValue("available");
    fireEvent.change(deskStatus, { target: { value: "paused" } });
    expect(screen.getByLabelText(/status for walnut writing desk/i)).toHaveValue("paused");

    const cameraStatus = screen.getByLabelText(/status for mirrorless camera kit/i);
    expect(cameraStatus).toHaveValue("reserved");
    expect(cameraStatus).toBeDisabled();
    expect(screen.getByText(/use picked or chat to mark paid or cancel/i)).toBeInTheDocument();

    fireEvent.change(cameraStatus, { target: { value: "available" } });
    expect(screen.getByLabelText(/status for mirrorless camera kit/i)).toHaveValue("reserved");

    fireEvent.change(cameraStatus, { target: { value: "sold" } });
    expect(screen.getByLabelText(/status for mirrorless camera kit/i)).toHaveValue("reserved");
  });

  it("lets the local seller edit owned listing details from My listings", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const deskRow = screen.getByText("Walnut writing desk").closest(".listing-management-row");
    expect(deskRow).not.toBeNull();
    fireEvent.click(within(deskRow as HTMLElement).getByRole("button", { name: /edit/i }));

    fireEvent.change(screen.getByLabelText(/edit title for walnut writing desk/i), {
      target: { value: "Walnut writing desk with riser" }
    });
    fireEvent.change(screen.getByLabelText(/edit price for walnut writing desk/i), {
      target: { value: "210" }
    });
    fireEvent.change(screen.getByLabelText(/edit pickup or shipping notes for walnut writing desk/i), {
      target: { value: "Brooklyn pickup after 6" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Walnut writing desk with riser")).not.toHaveLength(0);
    expect(screen.getAllByText(/\$210/)).not.toHaveLength(0);
  });

  it("blocks reserved and sold listing edits", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const cameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();
    expect(within(cameraRow as HTMLElement).getByRole("button", { name: /edit/i })).toBeDisabled();
    expect(screen.getByText(/use picked or chat to mark paid or cancel/i)).toBeInTheDocument();

    const deskStatus = screen.getByLabelText(/status for walnut writing desk/i);
    fireEvent.change(deskStatus, { target: { value: "sold" } });
    const soldDeskRow = screen.getByText("Walnut writing desk").closest(".listing-management-row");
    expect(soldDeskRow).not.toBeNull();
    expect(within(soldDeskRow as HTMLElement).getByRole("button", { name: /edit/i })).toBeDisabled();
  });

  it("links a local seller's reserved listing to chat and picked workflow", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const cameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();

    expect(within(cameraRow as HTMLElement).getByText(/buyer jordan lee/i)).toBeInTheDocument();
    expect(within(cameraRow as HTMLElement).getByText(/overdue/i)).toBeInTheDocument();

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /open chat/i }));
    expect(screen.getByRole("heading", { name: "Mirrorless camera kit" })).toBeInTheDocument();
    expect(screen.getByText(/i can pay today/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const refreshedCameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(refreshedCameraRow).not.toBeNull();
    fireEvent.click(within(refreshedCameraRow as HTMLElement).getByRole("button", { name: /open picked item/i }));

    expect(screen.getByRole("heading", { name: /reservations and manual payment/i })).toBeInTheDocument();
    expect(screen.getByText(/buyer jordan lee/i)).toBeInTheDocument();
    expect(document.querySelector(".active-order")).toHaveTextContent("Mirrorless camera kit");
  });

  it("lets the local seller mark a reserved listing paid from My listings", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const cameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /mark paid/i }));

    expect(screen.getByLabelText(/status for mirrorless camera kit/i)).toHaveValue("sold");
    expect(screen.queryByText(/buyer jordan lee/i)).not.toBeInTheDocument();
  });

  it("lets the local seller cancel a reserved listing from My listings", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const cameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /^cancel$/i }));

    expect(screen.getByLabelText(/status for mirrorless camera kit/i)).toHaveValue("available");
    expect(screen.queryByText(/buyer jordan lee/i)).not.toBeInTheDocument();
  });

  it("keeps browse public in Cloudflare mode when the visitor is logged out", async () => {
    mockCloudflareSession(null);

    render(<App />);

    expect(await screen.findByRole("heading", { name: /pick up items from local sellers/i })).toBeInTheDocument();
    expect(await screen.findAllByText("Cloudflare D1")).not.toHaveLength(0);
    expect(screen.getAllByRole("heading", { name: "Walnut writing desk" })).not.toHaveLength(0);
    expect(screen.queryByText(/log in to browse/i)).not.toBeInTheDocument();
  });

  it("prompts login and does not reserve when a logged-out visitor clicks Reserve", async () => {
    const fetchMock = mockCloudflareSession(null);

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    fireEvent.click(screen.getByRole("button", { name: /reserve post/i }));

    expect(await screen.findAllByText(/log in with email to reserve this post/i)).not.toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/reservations",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("prompts login immediately when a logged-out visitor clicks Sell", async () => {
    mockCloudflareSession(null);

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /sell/i }));

    expect(await screen.findByRole("heading", { name: /log in to sell/i })).toBeInTheDocument();
    expect(screen.getAllByText(/log in with email to sell a post/i)).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: /publish post/i })).not.toBeInTheDocument();
  });

  it("prompts login immediately when a logged-out visitor clicks Chat", async () => {
    mockCloudflareSession(null);

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /chat/i }));

    expect(await screen.findByRole("heading", { name: /log in to chat/i })).toBeInTheDocument();
    expect(screen.getAllByText(/log in with email to chat with buyers and sellers/i)).not.toHaveLength(0);
    expect(screen.queryByPlaceholderText(/write a message/i)).not.toBeInTheDocument();
  });

  it("submits owned listing edits to the Cloudflare listing endpoint", async () => {
    const fetchMock = mockCloudflareSession(seedState.users[0], cloudflarePublicState(seedState.users[0]));

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /sell/i }));
    const deskRow = await screen.findByText("Walnut writing desk");
    fireEvent.click(within(deskRow.closest(".listing-management-row") as HTMLElement).getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/edit title for walnut writing desk/i), {
      target: { value: "Walnut writing desk with riser" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/listings/listing-1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("Walnut writing desk with riser")
        })
      );
    });
  });

  it("shows Cloudflare seller reservation shortcuts without extra backend calls", async () => {
    const fetchMock = mockCloudflareSession(seedState.users[0], cloudflarePublicState(seedState.users[0]));

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /sell/i }));
    const cameraRow = (await screen.findByText("Mirrorless camera kit")).closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();
    expect(within(cameraRow as HTMLElement).getByText(/buyer jordan lee/i)).toBeInTheDocument();

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /open picked item/i }));

    expect(screen.getByRole("heading", { name: /reservations and manual payment/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /sell/i }));
    const refreshedCameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(refreshedCameraRow).not.toBeNull();
    fireEvent.click(within(refreshedCameraRow as HTMLElement).getByRole("button", { name: /open chat/i }));

    expect(screen.getByRole("heading", { name: "Mirrorless camera kit" })).toBeInTheDocument();
    expect(screen.getByText(/i can pay today/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("merges Cloudflare realtime message events without refetching state", async () => {
    const fetchMock = mockCloudflareSession(seedState.users[0], cloudflarePublicState(seedState.users[0]));

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    await waitFor(() => {
      expect(webSocketMock.instances).toHaveLength(1);
    });
    expect(webSocketMock.instances[0].url).toBe(
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/realtime`
    );

    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /chat/i }));

    act(() => {
      webSocketMock.instances[0].receive(
        JSON.stringify({
          version: 1,
          type: "message.created",
          message: {
            id: "message-realtime",
            reservationId: "reservation-1",
            senderId: "buyer-1",
            body: "Still available for pickup?",
            createdAt: "2026-05-28T12:00:00.000Z"
          },
          notification: {
            id: "notification-realtime",
            userId: "seller-1",
            type: "message_received",
            title: "New chat message",
            body: "Jordan Lee sent a message.",
            entityId: "reservation-1",
            createdAt: "2026-05-28T12:00:00.000Z"
          }
        })
      );
    });

    expect(await screen.findByText("Still available for pickup?")).toBeInTheDocument();
    expect(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /alerts \(1\)/i })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/state"))).toHaveLength(1);
  });

  it("submits Cloudflare seller reservation actions from My listings", async () => {
    const fetchMock = mockCloudflareSession(seedState.users[0], cloudflarePublicState(seedState.users[0]));

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /sell/i }));
    const cameraRow = (await screen.findByText("Mirrorless camera kit")).closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /mark paid/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reservations/reservation-1/status",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "paid" })
        })
      );
    });
  });

  it("exports authenticated Cloudflare user data", async () => {
    const createObjectURL = vi.fn(() => "blob:export");
    const revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const fetchMock = mockCloudflareSession(seedState.users[0], cloudflarePublicState(seedState.users[0]));

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    fireEvent.click(screen.getAllByRole("button", { name: /export data/i })[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/export",
        expect.objectContaining({ credentials: "include" })
      );
    });
    expect(createObjectURL).toHaveBeenCalled();
  });

  it("includes reserved posts and their items in local buyer exports", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:local-export");
    const revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    render(<App />);

    fireEvent.change(screen.getAllByLabelText(/demo user/i)[0], { target: { value: "buyer-1" } });
    fireEvent.click(screen.getAllByRole("button", { name: /export data/i })[0]);

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
    });

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const exported = JSON.parse(await blob.text()) as { user: User; state: AppState };
    expect(exported.user.id).toBe("buyer-1");
    expect(exported.state.listings.map((listing) => listing.id)).toContain("listing-2");
    expect(exported.state.listings.find((listing) => listing.id === "listing-2")?.items).toHaveLength(2);
    expect(exported.state.listings.map((listing) => listing.id)).not.toContain("listing-1");
  });

  it("does not fall back to local demo actions in production when the Cloudflare API fails", async () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("API down");
      })
    );

    render(<App />);

    expect(await screen.findByText("API down")).toBeInTheDocument();
    expect(screen.queryByText("Local demo")).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /sell/i }));

    expect(await screen.findByRole("heading", { name: /log in to sell/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish post/i })).not.toBeInTheDocument();
  });
});

function mockCloudflareSession(user: User | null, state: AppState = cloudflarePublicState(user)) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith("/api/me")) {
      return jsonResponse({ user });
    }
    if (path.endsWith("/api/state")) {
      return jsonResponse(state);
    }
    if (path.endsWith("/api/export")) {
      return jsonResponse({
        formatVersion: 2,
        exportedAt: "2026-05-25T00:00:00.000Z",
        architecture: {
          backend: [],
          businessModels: [],
          frontends: [],
          adapters: []
        },
        user,
        trustBadges: ["email_verified"],
        moderationStatuses: ["pending", "approved", "rejected", "flagged"],
        state
      });
    }
    if (path.includes("/api/listings/") && init?.method === "PATCH") {
      return jsonResponse(state);
    }
    if (path.includes("/api/reservations/") && path.endsWith("/status") && init?.method === "POST") {
      return jsonResponse(state);
    }
    return jsonResponse({ error: "Unexpected test request" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function cloudflarePublicState(user: User | null): AppState {
  return {
    ...seedState,
    activeUserId: user?.id ?? "",
    reservations: user ? seedState.reservations : [],
    messages: user ? seedState.messages : [],
    notifications: []
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function installWebSocketMock() {
  const instances: Array<{
    url: string;
    close: ReturnType<typeof vi.fn>;
    addEventListener(type: string, listener: (event: { data?: string }) => void): void;
    receive(data: string): void;
    open(): void;
  }> = [];

  class MockWebSocket {
    url: string;
    private listeners = new Map<string, Set<(event: { data?: string }) => void>>();

    constructor(url: string) {
      this.url = url;
      instances.push(this);
      queueMicrotask(() => this.open());
    }

    addEventListener(type: string, listener: (event: { data?: string }) => void) {
      const listeners = this.listeners.get(type) ?? new Set<(event: { data?: string }) => void>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    close = vi.fn(() => {
      this.emit("close", {});
    });

    receive(data: string) {
      this.emit("message", { data });
    }

    open() {
      this.emit("open", {});
    }

    private emit(type: string, event: { data?: string }) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  vi.stubGlobal("WebSocket", MockWebSocket);
  return { instances };
}
