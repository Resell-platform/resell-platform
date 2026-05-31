import { describe, expect, it } from "vitest";
import {
  cancelReservation,
  computeHoldExpirationNotifications,
  createListing,
  getAccountByEmail,
  getUserProfile,
  loginAccount,
  registerAccount,
  reserveListing,
  sendMessage,
  updateReservationHandoffPlan,
  updateListingDetails,
  updateListingStatus,
  updateSellerSetup,
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

const sellerSetup = {
  pickupArea: "Brooklyn",
  offPlatformInstructions: "Share phone details only after both sides confirm in chat.",
  responseExpectation: "Respond within 24 hours.",
  cancellationPolicy: "Cancel before the handoff window if plans change."
};

const sellerReadyState = updateSellerSetup(seedState, "seller-1", sellerSetup);

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
    const next = createListing(sellerReadyState, "seller-1", {
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
    expect(listing.price).toBe(455);
    expect(listing.condition).toBe("good");
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

  it("requires seller setup before creating a listing", () => {
    const incompleteSellerState: AppState = {
      ...seedState,
      users: seedState.users.map((user) =>
        user.id === "seller-1"
          ? {
              ...user,
              pickupArea: "",
              offPlatformInstructions: "",
              responseExpectation: "",
              cancellationPolicy: ""
            }
          : user
      )
    };
    const blocked = createListing(incompleteSellerState, "seller-1", draft);

    expect(blocked).toBe(incompleteSellerState);
    expect(sellerReadyState.users.find((user) => user.id === "seller-1")).toMatchObject(sellerSetup);
  });

  it("rejects missing, partial, and oversized item sets", () => {
    const partialItem = createListing(sellerReadyState, "seller-1", {
      ...draft,
      items: [
        {
          id: "draft-partial",
          name: "",
          price: 25,
          condition: "good",
          position: 0,
          createdAt: "2026-05-23T10:00:00.000Z"
        }
      ]
    });
    const blankItem = createListing(sellerReadyState, "seller-1", {
      ...draft,
      items: [
        {
          id: "draft-blank",
          name: "",
          position: 0,
          createdAt: "2026-05-23T10:00:00.000Z"
        }
      ]
    });
    const noItem = createListing(sellerReadyState, "seller-1", {
      ...draft,
      items: []
    });
    const missingPrice = createListing(sellerReadyState, "seller-1", {
      ...draft,
      items: [
        {
          id: "draft-missing-price",
          name: "Road bike",
          condition: "good",
          position: 0,
          createdAt: "2026-05-23T10:00:00.000Z"
        }
      ]
    });
    const tooManyItems = createListing(sellerReadyState, "seller-1", {
      ...draft,
      items: Array.from({ length: MAX_LISTING_ITEMS + 1 }, (_, index) => ({
        id: `draft-item-${index}`,
        name: `Item ${index + 1}`,
        price: 10 + index,
        condition: "good" as const,
        position: index,
        createdAt: "2026-05-23T10:00:00.000Z"
      }))
    });

    expect(partialItem).toBe(sellerReadyState);
    expect(blankItem).toBe(sellerReadyState);
    expect(noItem).toBe(sellerReadyState);
    expect(missingPrice).toBe(sellerReadyState);
    expect(tooManyItems).toBe(sellerReadyState);
  });

  it("rejects old drafts that do not send explicit items", () => {
    const { items: _items, ...legacyDraft } = draft;
    const next = createListing(sellerReadyState, "seller-1", legacyDraft as ListingDraft);

    expect(next).toBe(sellerReadyState);
  });

  it("starts buyer conversations without locking the listing", () => {
    const first = reserveListing(seedState, "listing-1", "buyer-1");
    const second = reserveListing(first, "listing-1", "buyer-2");
    const duplicate = reserveListing(second, "listing-1", "buyer-1");

    expect(first.listings.find((listing) => listing.id === "listing-1")?.status).toBe("available");
    expect(first.reservations).toHaveLength(seedState.reservations.length + 1);
    expect(second.reservations).toHaveLength(first.reservations.length + 1);
    expect(duplicate.reservations).toHaveLength(second.reservations.length);
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

  it("lets sellers manage status while buyer conversations are active", () => {
    const next = updateListingStatus(seedState, "listing-2", "seller-1", "paused");

    expect(next.listings.find((listing) => listing.id === "listing-2")?.status).toBe("paused");
    expect(next.reservations.find((reservation) => reservation.listingId === "listing-2")?.status).toBe(
      "requested"
    );
  });

  it("lets sellers mark a listing sold while preserving the buyer conversation", () => {
    const next = updateListingStatus(seedState, "listing-2", "seller-1", "sold");

    expect(next.listings.find((listing) => listing.id === "listing-2")?.status).toBe("sold");
    expect(next.reservations.find((reservation) => reservation.listingId === "listing-2")?.status).toBe(
      "requested"
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
      items: draft.items.map((item) => ({ ...item, price: 460 })),
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

  it("lets owners edit listing details while buyer conversations are active", () => {
    const edited = updateListingDetails(seedState, "listing-2", "seller-1", {
      ...draft,
      title: "Camera kit with extra battery",
      price: 520
    });

    expect(edited.listings.find((listing) => listing.id === "listing-2")?.title).toBe(
      "Camera kit with extra battery"
    );
    expect(edited.reservations.find((reservation) => reservation.listingId === "listing-2")?.status).toBe(
      "requested"
    );
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

  it("enforces handoff completion permissions", () => {
    const buyerCompleted = updateReservationStatus(seedState, "reservation-1", "buyer-1", "sold");
    const sellerCompleted = updateReservationStatus(seedState, "reservation-1", "seller-1", "sold");
    const cancelledAfterCompletion = updateReservationStatus(sellerCompleted, "reservation-1", "seller-1", "cancelled");

    expect(buyerCompleted.reservations[0].status).toBe("requested");
    expect(sellerCompleted.reservations[0].status).toBe("sold");
    expect(cancelledAfterCompletion.reservations[0].status).toBe("sold");
    expect(cancelledAfterCompletion.listings.find((listing) => listing.id === "listing-2")?.status).toBe("sold");
  });

  it("stores structured handoff plans and notifies the other participant", () => {
    const planned = updateReservationHandoffPlan(seedState, "reservation-1", "buyer-1", {
      mode: "pickup",
      window: "Saturday 2-4 PM",
      locationOrTracking: "Lobby entrance",
      note: "Text when nearby."
    });
    const reservation = planned.reservations.find((item) => item.id === "reservation-1");

    expect(reservation?.status).toBe("payment_sent");
    expect(reservation).toMatchObject({
      handoffMethod: "pickup",
      handoffWindow: "Saturday 2-4 PM",
      handoffLocation: "Lobby entrance",
      handoffNote: "Text when nearby."
    });
    expect(planned.notifications[0]).toMatchObject({
      userId: "seller-1",
      type: "handoff_planned",
      entityId: "reservation-1"
    });
  });

  it("stores cancellation reasons for buyers and sellers and reopens the listing", () => {
    const buyerCancelled = cancelReservation(seedState, "reservation-1", "buyer-1", "Plans changed");
    const sellerCancelled = cancelReservation(seedState, "reservation-1", "seller-1", "Item unavailable");

    expect(buyerCancelled.reservations[0]).toMatchObject({
      status: "cancelled",
      cancellationReason: "Plans changed",
      cancelledByUserId: "buyer-1"
    });
    expect(buyerCancelled.listings.find((listing) => listing.id === "listing-2")?.status).toBe("available");
    expect(buyerCancelled.notifications[0]).toMatchObject({
      userId: "seller-1",
      type: "reservation_cancelled"
    });
    expect(sellerCancelled.reservations[0]).toMatchObject({
      status: "cancelled",
      cancellationReason: "Item unavailable",
      cancelledByUserId: "seller-1"
    });
    expect(sellerCancelled.notifications[0]).toMatchObject({
      userId: "buyer-1",
      type: "reservation_cancelled"
    });
  });

  it("creates hold expiration notifications once per expired reservation", () => {
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

    const first = computeHoldExpirationNotifications(base, new Date("2026-05-23T10:00:00.000Z"));
    const second = computeHoldExpirationNotifications(first, new Date("2026-05-23T10:05:00.000Z"));

    expect(first.reservations[0].status).toBe("overdue");
    expect(first.notifications).toHaveLength(2);
    expect(second.notifications).toHaveLength(2);
  });

  it("does not create hold expiration notifications for completed or already-notified reservations", () => {
    const base: AppState = {
      ...seedState,
      notifications: [],
      reservations: [
        {
          ...seedState.reservations[0],
          id: "reservation-legacy-completed",
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

    const next = computeHoldExpirationNotifications(base, new Date("2026-05-23T10:00:00.000Z"));

    expect(next).toBe(base);
    expect(next.notifications).toHaveLength(0);
  });
});
