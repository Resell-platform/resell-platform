import type { ExportArchive } from "../data/remoteApi";
import type { AppState, User } from "../data/types";

export const emptyCloudState: AppState = {
  users: [],
  activeUserId: "",
  listings: [],
  reservations: [],
  messages: [],
  notifications: []
};

export function createLocalExport(state: AppState, activeUser?: User | null): ExportArchive {
  const user = activeUser ?? state.users[0] ?? { id: "local", name: "Local user", role: "seller" as const };
  const reservations = state.reservations.filter(
    (reservation) => reservation.buyerId === user.id || reservation.sellerId === user.id
  );
  const reservationIds = new Set(reservations.map((reservation) => reservation.id));
  const reservedListingIds = new Set(reservations.map((reservation) => reservation.listingId));
  return {
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    architecture: {
      backend: [
        "Cloudflare Pages Functions / Workers",
        "Cloudflare D1",
        "Cloudflare R2",
        "Resend email login",
        "HttpOnly session cookies",
        "Buyer interest and handoff workflow"
      ],
      businessModels: [
        "User / Profile",
        "Listing",
        "ListingItem",
        "ListingImage",
        "Reservation",
        "ChatMessage",
        "Notification",
        "TrustBadge",
        "ModerationStatus"
      ],
      frontends: [
        "Current H5 / PWA web app",
        "WeChat mini program later",
        "Xiaohongshu mini program later",
        "Messenger WebView later"
      ],
      adapters: [
        "Login adapter",
        "Share adapter",
        "Notification adapter",
        "Image upload adapter",
        "Deep link / open-in-app adapter",
        "Buyer interest coordination adapter"
      ]
    },
    user,
    trustBadges: [
      ...(user.emailVerifiedAt ? (["email_verified"] as const) : []),
      ...(user.phoneVerifiedAt ? (["phone_verified"] as const) : [])
    ],
    moderationStatuses: ["pending", "approved", "rejected", "flagged"],
    state: {
      ...state,
      activeUserId: user.id,
      listings: state.listings.filter(
        (listing) => listing.sellerId === user.id || reservedListingIds.has(listing.id)
      ),
      reservations,
      messages: state.messages.filter((message) => reservationIds.has(message.reservationId)),
      notifications: state.notifications.filter((notification) => notification.userId === user.id)
    }
  };
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
