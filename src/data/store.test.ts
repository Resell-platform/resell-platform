import { describe, expect, it } from "vitest";
import {
  computeOverdueNotifications,
  createListing,
  getAccountByEmail,
  getUserProfile,
  loginAccount,
  registerAccount,
  reserveListing,
  sendMessage,
  updateListingDetails,
  updateListingStatus,
  updateUserProfile,
  updateReservationStatus
} from "./store";
import { seedState } from "./seed";
import { MAX_LISTING_ITEMS, type AppState, type ListingDraft } from "./types";

const draft: ListingDraft = {
  title: "Road bike",
  description: "Aluminum frame, recently tuned.",
  price: 420,
  category: "Outdoor",
  condition: "good",
  location: "Local pickup",
  items: [
    {
      id: "draft-item",
      name: "Road bike",
      price: 420,
      condition: "good",
      notes: "Aluminum frame",
      position: 0,
      createdAt: "2026-05-23T10:00:00.000Z"
    }
  ],
  images: [
    {
      id: "draft-image",
      name: "bike.png",
      dataUrl: "data:image/png;base64,bike",
      primary: false,
      createdAt: "2026-05-23T10:00:00.000Z"
    }
  ]
};

describe("store state transitions", () => {
  it("registers a local account, profile, and active user", () => {
    const result = registerAccount(seedState, {
      name: "Taylor Reed",
      email: " Taylor@example.COM ",
      password: "password123",
      role: "buyer",
      bio: "Looking for used audio gear.",
      location: "Manhattan"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const account = result.account;
    expect(account).toBeDefined();
    if (!account) return;

    expect(account.email).toBe("taylor@example.com");
    expect(account.passwordHash).not.toBe("password123");
    expect(result.state.activeUserId).toBe(result.user.id);
    expect(result.state.activeAccountId).toBe(account.id);
    expect(result.profile.displayName).toBe("Taylor Reed");
    expect(result.profile.location).toBe("Manhattan");
  });

  it("prevents duplicate registration by normalized email", () => {
    const first = registerAccount(seedState, {
      name: "Taylor Reed",
      email: "taylor@example.com",
      password: "password123",
      role: "buyer"
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = registerAccount(first.state, {
      name: "Another Taylor",
      email: " TAYLOR@example.com ",
      password: "password123",
      role: "seller"
    });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("email_taken");
    expect(second.state.users).toHaveLength(first.state.users.length);
  });

  it("logs in an active account and updates the active session fields", () => {
    const registered = registerAccount(seedState, {
      name: "Taylor Reed",
      email: "taylor@example.com",
      password: "password123",
      role: "seller"
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    const account = registered.account;
    expect(account).toBeDefined();
    if (!account) return;

    const loggedIn = loginAccount(
      {
        ...registered.state,
        activeUserId: "buyer-1",
        activeAccountId: undefined
      },
      { email: " TAYLOR@example.com ", password: "password123" }
    );

    expect(loggedIn.ok).toBe(true);
    if (!loggedIn.ok) return;
    expect(loggedIn.state.activeUserId).toBe(registered.user.id);
    expect(loggedIn.state.activeAccountId).toBe(account.id);
    expect(getAccountByEmail(loggedIn.state, "taylor@example.com")?.lastLoginAt).toBeDefined();
  });

  it("updates a profile and keeps the user display name in sync", () => {
    const next = updateUserProfile(
      {
        ...seedState,
        profiles: []
      },
      "buyer-1",
      {
        displayName: "Jordan Rivera",
        bio: "Pickup preferred.",
        location: "Queens"
      }
    );

    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.state.users.find((user) => user.id === "buyer-1")?.name).toBe("Jordan Rivera");
    expect(getUserProfile(next.state, "buyer-1")?.bio).toBe("Pickup preferred.");
  });

  it("creates a listing with image metadata and available status", () => {
    const next = createListing(seedState, "seller-1", {
      ...draft,
      items: [
        ...draft.items,
        {
          id: "draft-item-2",
          name: "Helmet",
          price: 35,
          condition: "like_new",
          notes: "Medium",
          position: 1,
          createdAt: "2026-05-23T10:00:00.000Z"
        }
      ]
    });
    const listing = next.listings[0];

    expect(listing.title).toBe("Road bike");
    expect(listing.status).toBe("available");
    expect(listing.items).toMatchObject([
      {
        listingId: listing.id,
        name: "Road bike",
        price: 420,
        position: 0
      },
      {
        listingId: listing.id,
        name: "Helmet",
        price: 35,
        position: 1
      }
    ]);
    expect(listing.images).toHaveLength(1);
    expect(listing.images[0].primary).toBe(true);
  });

  it("rejects partial item rows and posts over the item limit", () => {
    const partialItem = createListing(seedState, "seller-1", {
      ...draft,
      items: [
        {
          id: "draft-partial",
          name: "",
          price: 25,
          position: 0,
          createdAt: "2026-05-23T10:00:00.000Z"
        }
      ]
    });
    const tooManyItems = createListing(seedState, "seller-1", {
      ...draft,
      items: Array.from({ length: MAX_LISTING_ITEMS + 1 }, (_, index) => ({
        id: `draft-item-${index}`,
        name: `Item ${index + 1}`,
        price: 10 + index,
        position: index,
        createdAt: "2026-05-23T10:00:00.000Z"
      }))
    });

    expect(partialItem).toBe(seedState);
    expect(tooManyItems).toBe(seedState);
  });

  it("defaults one listing item from post fields when old drafts do not send items", () => {
    const { items: _items, ...legacyDraft } = draft;
    const next = createListing(seedState, "seller-1", legacyDraft as ListingDraft);
    const listing = next.listings[0];

    expect(listing.items).toHaveLength(1);
    expect(listing.items[0]).toMatchObject({
      listingId: listing.id,
      name: "Road bike",
      price: 420,
      condition: "good",
      notes: "Aluminum frame, recently tuned."
    });
  });

  it("reserves an available listing once and prevents a second reservation", () => {
    const first = reserveListing(seedState, "listing-1", "buyer-1");
    const second = reserveListing(first, "listing-1", "buyer-2");

    expect(first.listings.find((listing) => listing.id === "listing-1")?.status).toBe("reserved");
    expect(first.reservations).toHaveLength(seedState.reservations.length + 1);
    expect(second.reservations).toHaveLength(first.reservations.length);
  });

  it("lets a listing owner pause and resume an available listing", () => {
    const paused = updateListingStatus(seedState, "listing-1", "seller-1", "paused");
    const available = updateListingStatus(paused, "listing-1", "seller-1", "available");

    expect(paused.listings.find((listing) => listing.id === "listing-1")?.status).toBe("paused");
    expect(available.listings.find((listing) => listing.id === "listing-1")?.status).toBe("available");
  });

  it("prevents non-owners from managing listing status", () => {
    const next = updateListingStatus(seedState, "listing-1", "buyer-1", "paused");

    expect(next).toBe(seedState);
  });

  it("prevents making a listing available while it has an active reservation", () => {
    const next = updateListingStatus(seedState, "listing-2", "seller-1", "available");

    expect(next).toBe(seedState);
    expect(next.listings.find((listing) => listing.id === "listing-2")?.status).toBe("reserved");
  });

  it("treats reserved listings as reservation-managed", () => {
    const next = updateListingStatus(seedState, "listing-2", "seller-1", "sold");

    expect(next).toBe(seedState);
    expect(next.listings.find((listing) => listing.id === "listing-2")?.status).toBe("reserved");
    expect(next.reservations.find((reservation) => reservation.listingId === "listing-2")?.status).toBe(
      "awaiting_payment"
    );
  });

  it("treats sold listings as terminal", () => {
    const sold = updateListingStatus(seedState, "listing-1", "seller-1", "sold");
    const available = updateListingStatus(sold, "listing-1", "seller-1", "available");

    expect(sold.listings.find((listing) => listing.id === "listing-1")?.status).toBe("sold");
    expect(available).toBe(sold);
  });

  it("lets owners edit available listing details and images", () => {
    const next = updateListingDetails(seedState, "listing-1", "seller-1", {
      ...draft,
      title: "Updated road bike",
      price: 460,
      images: [
        ...draft.images,
        {
          id: "second-image",
          name: "bike-side.png",
          dataUrl: "data:image/png;base64,bike-side",
          primary: false,
          createdAt: "2026-05-23T10:00:00.000Z"
        }
      ]
    });
    const listing = next.listings.find((item) => item.id === "listing-1");

    expect(listing?.title).toBe("Updated road bike");
    expect(listing?.price).toBe(460);
    expect(listing?.items).toMatchObject([
      {
        name: "Road bike",
        position: 0
      }
    ]);
    expect(listing?.images).toHaveLength(2);
    expect(listing?.images[0].primary).toBe(true);
    expect(listing?.images[1].primary).toBe(false);
  });

  it("prevents non-owners and sold listings from being edited", () => {
    const nonOwner = updateListingDetails(seedState, "listing-1", "buyer-1", draft);
    const sold = updateListingStatus(seedState, "listing-1", "seller-1", "sold");
    const editedSold = updateListingDetails(sold, "listing-1", "seller-1", {
      ...draft,
      title: "Should not save"
    });

    expect(nonOwner).toBe(seedState);
    expect(editedSold).toBe(sold);
  });

  it("prevents editing reserved listing details", () => {
    const copyOnly = updateListingDetails(seedState, "listing-2", "seller-1", {
      ...draft,
      title: "Camera kit with extra battery",
      price: 520
    });
    const priceChange = updateListingDetails(seedState, "listing-2", "seller-1", {
      ...draft,
      title: "Camera kit with price change",
      price: 540
    });

    expect(copyOnly).toBe(seedState);
    expect(priceChange).toBe(seedState);
  });

  it("does not let a seller reserve their own listing", () => {
    const next = reserveListing(seedState, "listing-1", "seller-1");

    expect(next).toBe(seedState);
  });

  it("stores chat messages only for reservation participants", () => {
    const allowed = sendMessage(seedState, "reservation-1", "buyer-1", "Still available?");
    const denied = sendMessage(seedState, "reservation-1", "buyer-2", "Can I see this?");

    expect(allowed.messages).toHaveLength(seedState.messages.length + 1);
    expect(allowed.listings.find((listing) => listing.id === "listing-2")?.items).toHaveLength(2);
    expect(denied.messages).toHaveLength(seedState.messages.length);
  });

  it("enforces manual payment permissions", () => {
    const buyerPaid = updateReservationStatus(seedState, "reservation-1", "buyer-1", "paid");
    const sellerPaid = updateReservationStatus(seedState, "reservation-1", "seller-1", "paid");
    const cancelledAfterPaid = updateReservationStatus(sellerPaid, "reservation-1", "seller-1", "cancelled");

    expect(buyerPaid.reservations[0].status).toBe("awaiting_payment");
    expect(sellerPaid.reservations[0].status).toBe("paid");
    expect(cancelledAfterPaid.reservations[0].status).toBe("paid");
    expect(cancelledAfterPaid.listings.find((listing) => listing.id === "listing-2")?.status).toBe("sold");
  });

  it("creates overdue notifications once per overdue reservation", () => {
    const base: AppState = {
      ...seedState,
      notifications: [],
      reservations: [
        {
          ...seedState.reservations[0],
          status: "awaiting_payment",
          overdueNotifiedAt: undefined,
          paymentDueAt: "2026-05-22T10:00:00.000Z"
        }
      ]
    };

    const first = computeOverdueNotifications(base, new Date("2026-05-23T10:00:00.000Z"));
    const second = computeOverdueNotifications(first, new Date("2026-05-23T10:05:00.000Z"));

    expect(first.reservations[0].status).toBe("overdue");
    expect(first.notifications).toHaveLength(2);
    expect(second.notifications).toHaveLength(2);
  });

  it("does not create overdue notifications for paid or already-notified reservations", () => {
    const base: AppState = {
      ...seedState,
      notifications: [],
      reservations: [
        {
          ...seedState.reservations[0],
          id: "reservation-paid",
          status: "paid",
          overdueNotifiedAt: undefined,
          paymentDueAt: "2026-05-22T10:00:00.000Z"
        },
        {
          ...seedState.reservations[0],
          id: "reservation-already-notified",
          status: "awaiting_payment",
          overdueNotifiedAt: "2026-05-22T11:00:00.000Z",
          paymentDueAt: "2026-05-22T10:00:00.000Z"
        }
      ]
    };

    const next = computeOverdueNotifications(base, new Date("2026-05-23T10:00:00.000Z"));

    expect(next).toBe(base);
    expect(next.notifications).toHaveLength(0);
  });
});
