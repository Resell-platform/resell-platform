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

function fillSellerSetup() {
  fireEvent.change(screen.getByLabelText(/pickup area/i), { target: { value: "Brooklyn" } });
  fireEvent.change(screen.getByLabelText(/cancellation and handoff policy/i), {
    target: { value: "Cancel before the handoff window if plans change." }
  });
}

function stubNarrowLayout(matches = true) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("max-width: 900px") ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
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

  it("creates a single-item listing after tracking multi-image upload and removal state", async () => {
    const { container } = render(<App />);

	    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
	    fillSellerSetup();
	    expect(screen.queryByLabelText(/response expectation/i)).not.toBeInTheDocument();
	    expect(screen.queryByLabelText(/off-platform instructions/i)).not.toBeInTheDocument();
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

    expect(screen.getByLabelText(/item name 1/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Test lamp" } });
    fireEvent.change(screen.getByLabelText(/pickup or shipping notes/i), {
      target: { value: "Porch pickup" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Brass desk lamp with working dimmer." }
    });
    fireEvent.change(screen.getByLabelText(/item name 1/i), { target: { value: "Brass desk lamp" } });
    fireEvent.change(screen.getByLabelText(/item price 1/i), { target: { value: "64" } });
    fireEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    expect(await screen.findAllByRole("heading", { name: "Test lamp" })).toHaveLength(2);
    expect(screen.getAllByText("$64")).not.toHaveLength(0);
    expect(screen.getByText("Porch pickup")).toBeInTheDocument();
    expect(screen.getAllByText("Brass desk lamp with working dimmer.")).not.toHaveLength(0);
    expect(screen.getByText(/included items/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1 item/i)).not.toHaveLength(0);
    expect(screen.getAllByText("Brass desk lamp")).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const createdRow = screen.getByText("Test lamp").closest(".listing-management-row");
    expect(createdRow).not.toBeNull();
    fireEvent.click(within(createdRow as HTMLElement).getByRole("button", { name: /edit/i }));
    expect(screen.getByLabelText(/edit test lamp item name 1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    });
  });

  it("creates a multi-item listing after adding individual item rows", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    fillSellerSetup();
    fireEvent.change(screen.getByLabelText(/images/i), {
      target: { files: [new File(["bundle"], "bundle.png", { type: "image/png" })] }
    });

    await waitFor(() => {
      expect(container.querySelectorAll(".upload-strip img")).toHaveLength(1);
    });

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Desk bundle" } });
    fireEvent.change(screen.getByLabelText(/pickup or shipping notes/i), {
      target: { value: "Porch pickup" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Desk setup with a lamp and extra bulbs." }
    });
    expect(screen.getByRole("button", { name: /publish listing/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/item name 1/i), { target: { value: "Brass desk lamp" } });
    fireEvent.change(screen.getByLabelText(/item price 1/i), { target: { value: "64" } });
    fireEvent.click(screen.getByRole("button", { name: /^add item$/i }));
    fireEvent.change(screen.getByLabelText(/item name 2/i), { target: { value: "Bulb pack" } });
    fireEvent.change(screen.getByLabelText(/item price 2/i), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    expect(await screen.findAllByRole("heading", { name: "Desk bundle" })).toHaveLength(2);
    expect(screen.getAllByText("Brass desk lamp")).not.toHaveLength(0);
    expect(screen.getAllByText("Bulb pack")).not.toHaveLength(0);
  });

  it("collapses detail items on narrow screens until expanded", async () => {
    stubNarrowLayout();
    render(
      <App />,
      {
        wrapper: ({ children }) => {
          window.localStorage.setItem(
            "resell-platform:v1",
            JSON.stringify({
              version: 3,
              data: {
                ...seedState,
                listings: [
                  {
                    ...seedState.listings[0],
                    id: "listing-many-items",
                    title: "Kitchen starter set",
                    description: "Four-piece kitchen bundle.",
                    items: [1, 2, 3, 4].map((itemNumber, index) => ({
                      id: `kitchen-item-${itemNumber}`,
                      listingId: "listing-many-items",
                      name: `Kitchen item ${itemNumber}`,
                      price: 10 * itemNumber,
                      condition: "good" as const,
                      position: index,
                      createdAt: "2026-05-23T10:00:00.000Z"
                    }))
                  }
                ]
              }
            })
          );
          return <>{children}</>;
        }
      }
    );

    expect(screen.getByText("4 items")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /kitchen starter set/i }));
    expect(screen.getByRole("button", { name: /back to listings/i })).toBeInTheDocument();
    expect(screen.getByText("Kitchen item 1")).toBeInTheDocument();
    expect(screen.getByText("Kitchen item 2")).toBeInTheDocument();
    expect(screen.getByText("Kitchen item 3")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Kitchen item 4")).not.toBeInTheDocument();
    });

    const showAll = screen.getByRole("button", { name: /show all/i });
    expect(showAll).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(showAll);
    expect(screen.getByText("Kitchen item 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show fewer/i })).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: /show fewer/i }));
    expect(screen.queryByText("Kitchen item 4")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back to listings/i }));
    expect(screen.getByRole("heading", { name: /pick up items from local sellers/i })).toBeInTheDocument();
  });

  it("filters and sorts browse listings on the client", () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "Electronics" } });

    expect(screen.getAllByText("Mirrorless camera kit")).not.toHaveLength(0);
    expect(screen.queryByText("Walnut writing desk")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    fireEvent.change(screen.getByLabelText(/min price/i), { target: { value: "300" } });

    expect(screen.getAllByText("Mirrorless camera kit")).not.toHaveLength(0);
    expect(screen.queryByText("Walnut writing desk")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/max price/i), { target: { value: "10" } });

    expect(screen.getByText(/no listings match these filters/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mirrorless camera kit" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    fireEvent.change(screen.getByLabelText(/sort by/i), { target: { value: "price_desc" } });

    const cardTitles = Array.from(container.querySelectorAll(".listing-card h2")).map((node) => node.textContent);
    expect(cardTitles[0]).toBe("Mirrorless camera kit");
  });

  it("toggles the responsive browse filters with an active filter count", () => {
    const { container } = render(<App />);

    expect(screen.getByPlaceholderText(/search listings/i)).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /^filters$/i });
    const controls = container.querySelector("#browse-filter-controls");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(controls).not.toHaveClass("expanded");

    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "Electronics" } });
    expect(screen.getByRole("button", { name: /filters \(1 active\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /filters \(1 active\)/i }));
    expect(screen.getByRole("button", { name: /hide filters/i })).toHaveAttribute("aria-expanded", "true");
    expect(controls).toHaveClass("expanded");

    fireEvent.click(screen.getByRole("button", { name: /hide filters/i }));
    expect(screen.getByRole("button", { name: /filters \(1 active\)/i })).toHaveAttribute("aria-expanded", "false");
    expect(controls).not.toHaveClass("expanded");
  });

  it("lets narrow screen users explicitly collapse completed seller item rows", () => {
    stubNarrowLayout();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    expect(screen.getByLabelText(/item name 1/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/item name 1/i), { target: { value: "Brass desk lamp" } });
    fireEvent.change(screen.getByLabelText(/item price 1/i), { target: { value: "64" } });
    const completedSummary = screen.getByRole("button", { name: /item 1.*brass desk lamp/i });
    const controlledRegionId = completedSummary.getAttribute("aria-controls");
    expect(controlledRegionId).toBeTruthy();

    expect(completedSummary).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(controlledRegionId!)).not.toHaveAttribute("hidden");
    expect(screen.getByLabelText(/item name 1/i)).toBeInTheDocument();
    fireEvent.click(completedSummary);
    expect(document.getElementById(controlledRegionId!)).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: /item 1.*brass desk lamp/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    fireEvent.click(screen.getByRole("button", { name: /item 1.*brass desk lamp/i }));
    expect(document.getElementById(controlledRegionId!)).not.toHaveAttribute("hidden");

    fireEvent.click(screen.getByRole("button", { name: /^add item$/i }));
    expect(screen.getByLabelText(/item name 2/i)).toBeInTheDocument();
  });

  it("saves a structured handoff plan from a reservation", () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getAllByLabelText(/demo user/i)[0], { target: { value: "buyer-1" } });
    fireEvent.click(screen.getByRole("button", { name: /reservations/i }));
    fireEvent.change(screen.getByLabelText(/window/i), { target: { value: "Saturday 2-4 PM" } });
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: "Lobby entrance" } });
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Text when nearby." } });
    fireEvent.click(screen.getByRole("button", { name: /save handoff plan/i }));

    expect(screen.getByText("Saturday 2-4 PM")).toBeInTheDocument();
    expect(screen.getByText("Lobby entrance")).toBeInTheDocument();
    expect(screen.getAllByText("Text when nearby.").length).toBeGreaterThan(0);
    expect(screen.getByText(/handoff planned/i)).toBeInTheDocument();
  });

  it("requires a cancellation reason before cancelling a buyer reservation", () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getAllByLabelText(/demo user/i)[0], { target: { value: "buyer-1" } });
    fireEvent.click(screen.getByRole("button", { name: /reservations/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel conversation/i }));
    expect(screen.getByRole("button", { name: /confirm cancellation/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/cancellation reason/i), { target: { value: "Plans changed" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm cancellation/i }));

    expect(screen.getByText(/plans changed/i)).toBeInTheDocument();
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
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

    expect(screen.getByText(/contact a seller to start/i)).toBeInTheDocument();
    expect(screen.queryByText(/i can pick up tomorrow/i)).not.toBeInTheDocument();
  });

  it("clears unread notifications when marking them read", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /alerts/i }));
    expect(screen.getByRole("heading", { name: /follow-up due/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /mark read/i }));

    expect(screen.queryByRole("heading", { name: /hold expired/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no unread notifications/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark read/i })).toBeDisabled();
  });

  it("keeps the primary mobile navigation visible in the rendered shell", () => {
    const { container } = render(<App />);

    const navigation = screen.getByLabelText(/primary navigation/i);

    for (const label of ["Browse", "Sell", "Reservations", "Chat"]) {
      expect(within(navigation).getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
    expect(container.querySelector(".mobile-app-header .brand-mark")).toHaveAttribute("src", "/brand/icon-192.png");

    fireEvent.click(screen.getByRole("button", { name: /hide nav/i }));
    expect(container.querySelector(".app")).toHaveClass("mobile-nav-hidden");
    fireEvent.click(screen.getByRole("button", { name: /show nav/i }));
    expect(container.querySelector(".app")).not.toHaveClass("mobile-nav-hidden");
  });

  it("collapses and expands the desktop sidebar", () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(container.querySelector(".app")).toHaveClass("sidebar-collapsed");
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand sidebar/i }));
    expect(container.querySelector(".app")).not.toHaveClass("sidebar-collapsed");
  });

  it("keeps publish and edit listing workflows available for a mobile viewport", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    fillSellerSetup();
    fireEvent.change(screen.getByLabelText(/images/i), {
      target: { files: [new File(["mobile"], "mobile.png", { type: "image/png" })] }
    });
    await waitFor(() => {
      expect(container.querySelectorAll(".upload-strip img")).toHaveLength(1);
    });
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Mobile floor lamp" } });
    fireEvent.change(screen.getByLabelText(/pickup or shipping notes/i), {
      target: { value: "Lobby pickup" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Slim lamp tested from a phone-sized layout." }
    });
    fireEvent.change(screen.getByLabelText(/item name 1/i), { target: { value: "Mobile floor lamp" } });
    fireEvent.change(screen.getByLabelText(/item price 1/i), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    expect(await screen.findAllByRole("heading", { name: "Mobile floor lamp" })).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const deskRow = screen.getByText("Walnut writing desk").closest(".listing-management-row");
    expect(deskRow).not.toBeNull();
    fireEvent.click(within(deskRow as HTMLElement).getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/edit walnut writing desk item price 1/i), {
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
    expect(cameraStatus).toHaveValue("available");
    expect(cameraStatus).not.toBeDisabled();
    expect(screen.getByText(/buyer is interested/i)).toBeInTheDocument();

    fireEvent.change(cameraStatus, { target: { value: "paused" } });
    expect(screen.getByLabelText(/status for mirrorless camera kit/i)).toHaveValue("paused");
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
    fireEvent.change(screen.getByLabelText(/edit walnut writing desk item price 1/i), {
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

  it("keeps buyer conversations from blocking seller edits", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const cameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();
    expect(within(cameraRow as HTMLElement).getByRole("button", { name: /edit/i })).not.toBeDisabled();
    expect(screen.getByText(/buyer is interested/i)).toBeInTheDocument();

    const deskStatus = screen.getByLabelText(/status for walnut writing desk/i);
    fireEvent.change(deskStatus, { target: { value: "sold" } });
    const soldDeskRow = screen.getByText("Walnut writing desk").closest(".listing-management-row");
    expect(soldDeskRow).not.toBeNull();
    expect(within(soldDeskRow as HTMLElement).getByRole("button", { name: /edit/i })).toBeDisabled();
  });

  it("links a local seller's buyer conversation to chat and handoff workflow", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const cameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();

    expect(within(cameraRow as HTMLElement).getByText(/buyer jordan lee/i)).toBeInTheDocument();
    expect(within(cameraRow as HTMLElement).getByText(/follow-up by/i)).toBeInTheDocument();

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /open chat/i }));
    expect(screen.getByRole("heading", { name: "Mirrorless camera kit" })).toBeInTheDocument();
    expect(screen.getByText(/i can pick up tomorrow/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const refreshedCameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(refreshedCameraRow).not.toBeNull();
    fireEvent.click(within(refreshedCameraRow as HTMLElement).getByRole("button", { name: /open handoff/i }));

    expect(screen.getByRole("heading", { name: /handoffs and buyer conversations/i })).toBeInTheDocument();
    expect(screen.getByText(/buyer jordan lee/i)).toBeInTheDocument();
    expect(document.querySelector(".active-order")).toHaveTextContent("Mirrorless camera kit");
  });

  it("lets the local seller complete a handoff from My listings", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const cameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /complete handoff/i }));

    expect(screen.getByLabelText(/status for mirrorless camera kit/i)).toHaveValue("sold");
    expect(screen.queryByText(/buyer jordan lee/i)).not.toBeInTheDocument();
  });

  it("lets the local seller cancel a buyer conversation from My listings", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const cameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(cameraRow).not.toBeNull();

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /^cancel$/i }));
    fireEvent.change(screen.getByLabelText(/cancellation reason/i), { target: { value: "Plans changed" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm cancellation/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/status for mirrorless camera kit/i)).toHaveValue("available");
    });
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

  it("keeps the signed-in account panel compact until profile editing is opened", async () => {
    mockCloudflareSession(seedState.users[0], cloudflarePublicState(seedState.users[0]));

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    expect(screen.getAllByText("Avery Chen")).not.toHaveLength(0);
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no phone badge/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /edit profile/i })[0]);
    expect(screen.getAllByLabelText(/display name/i)).not.toHaveLength(0);
  });

  it("prompts login and does not contact the seller when a logged-out visitor clicks Contact seller", async () => {
    const fetchMock = mockCloudflareSession(null);

    render(<App />);

    await screen.findAllByText("Cloudflare D1");
    fireEvent.click(screen.getByRole("button", { name: /contact seller/i }));

    expect(await screen.findAllByText(/log in with email to contact this seller/i)).not.toHaveLength(0);
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
    expect(screen.getAllByText(/log in with email to sell a listing/i)).not.toHaveLength(0);
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

  it("saves Cloudflare seller setup before publishing a first listing", async () => {
    const firstTimeSeller = {
      ...seedState.users[0],
      pickupArea: "",
      offPlatformInstructions: "",
      responseExpectation: "",
      cancellationPolicy: "",
      sellerActivatedAt: undefined
    };
    const fetchMock = mockCloudflareSession(firstTimeSeller, cloudflarePublicState(firstTimeSeller));

    const { container } = render(<App />);

    await screen.findAllByText("Cloudflare D1");
    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /sell/i }));
    fillSellerSetup();
    fireEvent.change(screen.getByLabelText(/images/i), {
      target: { files: [new File(["chair"], "chair.png", { type: "image/png" })] }
    });
    await waitFor(() => {
      expect(container.querySelectorAll(".upload-strip img")).toHaveLength(1);
    });
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Reading chair" } });
    fireEvent.change(screen.getByLabelText(/pickup or shipping notes/i), {
      target: { value: "Pickup near Prospect Park" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Comfortable accent chair with clean fabric." }
    });
    fireEvent.change(screen.getByLabelText(/item name 1/i), { target: { value: "Accent chair" } });
    fireEvent.change(screen.getByLabelText(/item price 1/i), { target: { value: "85" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /publish listing/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    await waitFor(() => {
	      expect(fetchMock).toHaveBeenCalledWith(
	        "/api/me",
	        expect.objectContaining({
	          method: "PATCH",
	          body: expect.stringContaining("Cancel before the handoff window if plans change.")
	        })
	      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/listings",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Reading chair")
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

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /open handoff/i }));

    expect(screen.getByRole("heading", { name: /handoffs and buyer conversations/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(within(screen.getByLabelText(/primary navigation/i)).getByRole("button", { name: /sell/i }));
    const refreshedCameraRow = screen.getByText("Mirrorless camera kit").closest(".listing-management-row");
    expect(refreshedCameraRow).not.toBeNull();
    fireEvent.click(within(refreshedCameraRow as HTMLElement).getByRole("button", { name: /open chat/i }));

    expect(screen.getByRole("heading", { name: "Mirrorless camera kit" })).toBeInTheDocument();
    expect(screen.getByText(/i can pick up tomorrow/i)).toBeInTheDocument();
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

    fireEvent.click(within(cameraRow as HTMLElement).getByRole("button", { name: /complete handoff/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reservations/reservation-1/status",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "sold" })
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

  it("includes reserved listings and their items in local buyer exports", async () => {
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
    expect(screen.queryByRole("button", { name: /publish listing/i })).not.toBeInTheDocument();
  });
});

function mockCloudflareSession(user: User | null, state: AppState = cloudflarePublicState(user)) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith("/api/me") && init?.method === "PATCH") {
      return jsonResponse({ user, state });
    }
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
    if (path.endsWith("/api/listings") && init?.method === "POST") {
      return jsonResponse(state);
    }
    if (path.includes("/api/reservations/") && path.endsWith("/status") && init?.method === "POST") {
      return jsonResponse(state);
    }
    if (path.includes("/api/reservations/") && init?.method === "PATCH") {
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
