import { afterEach, describe, expect, it, vi } from "vitest";
import { buildListingSharePayload, createNoPaymentAdapter, createWebPlatformAdapters } from "./adapters";
import { seedState } from "../data/seed";

describe("platform adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps payment explicitly off-platform", () => {
    const adapter = createNoPaymentAdapter("h5-pwa");

    expect(adapter.provider).toBe("none");
    expect(adapter.canProcessPayment).toBe(false);
    expect(adapter.mode).toBe("off_platform");
    expect(adapter.supportedReservationStatuses).toContain("payment_sent");
    expect(adapter.supportedReservationStatuses).toContain("paid");
  });

  it("builds listing share payloads for platform share surfaces", () => {
    const listing = seedState.listings[0];

    expect(buildListingSharePayload(listing, "https://example.com/?listing=listing-1")).toEqual({
      title: listing.title,
      text: `${listing.title} - 1 item - $${listing.price}`,
      url: "https://example.com/?listing=listing-1"
    });
  });

  it("uses clipboard share fallback when native share is unavailable", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const adapters = createWebPlatformAdapters("https://example.com");

    const result = await adapters.share.share({
      title: "Desk",
      text: "Desk - $180",
      url: adapters.deepLink.listingUrl("listing-1")
    });

    expect(result.method).toBe("clipboard");
    expect(writeText).toHaveBeenCalledWith("https://example.com/?listing=listing-1");
  });

  it("rejects oversized or non-image uploads before creating image records", async () => {
    const adapters = createWebPlatformAdapters("https://example.com");
    const accepted = new File(["image"], "image.png", { type: "image/png" });
    const oversized = new File(["larger"], "large.png", { type: "image/png" });
    const text = new File(["text"], "note.txt", { type: "text/plain" });

    const result = await adapters.imageUpload.readImages([accepted, oversized, text], {
      maxBytes: 5,
      remainingSlots: 6
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({ name: "image.png", primary: false });
    expect(result.rejected.map((file) => file.name)).toEqual(["large.png", "note.txt"]);
  });
});
