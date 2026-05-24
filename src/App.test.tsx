import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  beforeEach(() => {
    installLocalStorage();
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
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: "64" } });
    fireEvent.change(screen.getByLabelText(/pickup or shipping notes/i), {
      target: { value: "Porch pickup" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Brass desk lamp with working dimmer." }
    });
    fireEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    expect(await screen.findAllByRole("heading", { name: "Test lamp" })).toHaveLength(2);
    expect(screen.getAllByText("$64")).toHaveLength(2);
    expect(screen.getByText("Porch pickup")).toBeInTheDocument();
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

    expect(screen.getByText(/reserve an item to start/i)).toBeInTheDocument();
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
    render(<App />);

    const navigation = screen.getByLabelText(/primary navigation/i);

    for (const label of ["Browse", "Sell", "Picked", "Chat"]) {
      expect(within(navigation).getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
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
    fireEvent.click(screen.getByRole("button", { name: /reserve item/i }));

    expect(await screen.findAllByText(/log in with email to reserve this item/i)).not.toHaveLength(0);
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
    expect(screen.getAllByText(/log in with email to sell an item/i)).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: /publish listing/i })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /publish listing/i })).not.toBeInTheDocument();
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
