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
  updateListingStatus,
  updateUserProfile,
  updateReservationStatus
} from "./store";
import { seedState } from "./seed";
import type { AppState, ListingDraft } from "./types";

const draft: ListingDraft = {
  title: "Road bike",
  description: "Aluminum frame, recently tuned.",
  price: 420,
  category: "Outdoor",
  condition: "good",
  location: "Local pickup",
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
    const next = createListing(seedState, "seller-1", draft);
    const listing = next.listings[0];

    expect(listing.title).toBe("Road bike");
    expect(listing.status).toBe("available");
    expect(listing.images).toHaveLength(1);
    expect(listing.images[0].primary).toBe(true);
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

  it("does not let a seller reserve their own listing", () => {
    const next = reserveListing(seedState, "listing-1", "seller-1");

    expect(next).toBe(seedState);
  });

  it("stores chat messages only for reservation participants", () => {
    const allowed = sendMessage(seedState, "reservation-1", "buyer-1", "Still available?");
    const denied = sendMessage(seedState, "reservation-1", "buyer-2", "Can I see this?");

    expect(allowed.messages).toHaveLength(seedState.messages.length + 1);
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
