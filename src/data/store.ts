import { seedState } from "./seed";
import { createLocalStorageResource } from "../lib/storage";
import {
  MAX_LISTING_ITEMS,
  type AccountActionError,
  type AccountActionResult,
  type AppState,
  type Listing,
  type ListingDraft,
  type ListingItem,
  type ListingStatus,
  type LoginCredentials,
  type Message,
  type Notification,
  type ProfileDraft,
  type RegistrationDraft,
  type Reservation
} from "./types";

const STORAGE_KEY = "resell-platform:v1";
const STORAGE_VERSION = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const ACTIVE_RESERVATION_STATUSES: Reservation["status"][] = [
  "requested",
  "awaiting_payment",
  "payment_sent",
  "overdue"
];
const LISTING_CONDITIONS = new Set(["new", "like_new", "good", "fair"]);

const stateResource = createLocalStorageResource<AppState>({
  key: STORAGE_KEY,
  version: STORAGE_VERSION,
  defaultValue: seedState,
  migrate: migrateAppState,
  validate: isAppState
});

export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function loadState(): AppState {
  return normalizeAppState(stateResource.load());
}

export function saveState(state: AppState): void {
  stateResource.save(normalizeAppState(state));
}

export function resetState(): AppState {
  return stateResource.reset().data;
}

export function getPrimaryImage(listing: Listing): string | undefined {
  return listing.images.find((image) => image.primary)?.dataUrl ?? listing.images[0]?.dataUrl;
}

function isValidListingDraft(draft: ListingDraft): boolean {
  const items = normalizeDraftItems(draft, "validation-listing", new Date().toISOString());
  return (
    draft.title.trim().length > 0 &&
    draft.description.trim().length > 0 &&
    draft.location.trim().length > 0 &&
    draft.category.trim().length > 0 &&
    Number.isFinite(draft.price) &&
    draft.price > 0 &&
    LISTING_CONDITIONS.has(draft.condition) &&
    draft.images.length >= 1 &&
    draft.images.length <= 6 &&
    hasValidDraftItems(draft) &&
    items.length > 0
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getUserAccount(state: AppState, userId: string) {
  return state.accounts?.find((account) => account.userId === userId);
}

export function getAccountByEmail(state: AppState, email: string) {
  const normalizedEmail = normalizeEmail(email);
  return state.accounts?.find((account) => account.email === normalizedEmail);
}

export function getUserProfile(state: AppState, userId: string) {
  const profile = state.profiles?.find((item) => item.userId === userId);
  if (profile) return profile;

  const user = state.users.find((item) => item.id === userId);
  if (!user) return undefined;

  const timestamp = new Date().toISOString();
  return {
    userId,
    displayName: user.name,
    bio: "",
    location: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function registerAccount(state: AppState, draft: RegistrationDraft): AccountActionResult {
  const name = draft.name.trim();
  if (!name) {
    return accountError(state, "name_required", "A display name is required.");
  }

  const email = normalizeEmail(draft.email);
  if (!isValidEmail(email)) {
    return accountError(state, "invalid_email", "A valid email address is required.");
  }

  if (getAccountByEmail(state, email)) {
    return accountError(state, "email_taken", "An account already exists for this email.");
  }

  if (draft.password.length < MIN_PASSWORD_LENGTH) {
    return accountError(state, "weak_password", "Password must be at least 8 characters.");
  }

  const now = new Date().toISOString();
  const user = {
    id: createId("user"),
    name,
    role: draft.role
  };
  const account = {
    id: createId("account"),
    userId: user.id,
    email,
    passwordHash: createLocalPasswordHash(email, draft.password),
    status: "active" as const,
    createdAt: now,
    updatedAt: now
  };
  const profile = {
    userId: user.id,
    displayName: name,
    bio: draft.bio?.trim() ?? "",
    location: draft.location?.trim() ?? "",
    avatarDataUrl: draft.avatarDataUrl,
    createdAt: now,
    updatedAt: now
  };
  const nextState = normalizeAppState({
    ...state,
    users: [...state.users, user],
    accounts: [account, ...(state.accounts ?? [])],
    profiles: [profile, ...(state.profiles ?? [])],
    activeUserId: user.id,
    activeAccountId: account.id
  });

  return {
    ok: true,
    state: nextState,
    user,
    account,
    profile
  };
}

export function loginAccount(state: AppState, credentials: LoginCredentials): AccountActionResult {
  const email = normalizeEmail(credentials.email);
  const account = getAccountByEmail(state, email);
  if (!account || account.passwordHash !== createLocalPasswordHash(email, credentials.password)) {
    return accountError(state, "invalid_credentials", "Email or password is incorrect.");
  }

  if (account.status !== "active") {
    return accountError(state, "account_disabled", "This account is disabled.");
  }

  const user = state.users.find((item) => item.id === account.userId);
  if (!user) {
    return accountError(state, "user_not_found", "The account user profile could not be found.");
  }

  const now = new Date().toISOString();
  const nextAccount = {
    ...account,
    lastLoginAt: now,
    updatedAt: now
  };
  const nextState = normalizeAppState({
    ...state,
    activeUserId: account.userId,
    activeAccountId: account.id,
    accounts: (state.accounts ?? []).map((item) => (item.id === account.id ? nextAccount : item))
  });
  const profile = getUserProfile(nextState, user.id);
  if (!profile) {
    return accountError(state, "user_not_found", "The account profile could not be found.");
  }

  return {
    ok: true,
    state: nextState,
    user,
    account: nextAccount,
    profile
  };
}

export function updateUserProfile(state: AppState, userId: string, draft: ProfileDraft): AccountActionResult {
  const user = state.users.find((item) => item.id === userId);
  if (!user) {
    return accountError(state, "user_not_found", "User not found.");
  }

  const displayName = draft.displayName.trim();
  if (!displayName) {
    return accountError(state, "name_required", "A display name is required.");
  }

  const now = new Date().toISOString();
  const currentProfile = getUserProfile(state, userId);
  const profile = {
    userId,
    displayName,
    bio: draft.bio?.trim() ?? currentProfile?.bio ?? "",
    location: draft.location?.trim() ?? currentProfile?.location ?? "",
    avatarDataUrl: draft.avatarDataUrl ?? currentProfile?.avatarDataUrl,
    createdAt: currentProfile?.createdAt ?? now,
    updatedAt: now
  };
  const existingProfiles = state.profiles ?? [];
  const hasProfile = existingProfiles.some((item) => item.userId === userId);
  const nextState = normalizeAppState({
    ...state,
    users: state.users.map((item) => (item.id === userId ? { ...item, name: displayName } : item)),
    profiles: hasProfile
      ? existingProfiles.map((item) => (item.userId === userId ? profile : item))
      : [profile, ...existingProfiles]
  });

  return {
    ok: true,
    state: nextState,
    user: { ...user, name: displayName },
    account: getUserAccount(nextState, userId),
    profile
  };
}

export function createListing(state: AppState, sellerId: string, draft: ListingDraft): AppState {
  if (!isValidListingDraft(draft)) return state;

  const now = new Date().toISOString();
  const listingId = createId("listing");
  const listing: Listing = {
    ...draft,
    id: listingId,
    sellerId,
    status: "available",
    createdAt: now,
    updatedAt: now,
    items: normalizeDraftItems(draft, listingId, now),
    images: draft.images.map((image, index) => ({
      ...image,
      primary: index === 0
    }))
  };

  return {
    ...state,
    listings: [listing, ...state.listings]
  };
}

export function updateListingStatus(
  state: AppState,
  listingId: string,
  sellerId: string,
  status: Exclude<ListingStatus, "reserved">
): AppState {
  const listing = state.listings.find((item) => item.id === listingId);
  if (!listing || listing.sellerId !== sellerId) return state;
  if (listing.status === "sold" || listing.status === "reserved") return state;

  const hasActiveReservation = state.reservations.some(
    (reservation) =>
      reservation.listingId === listingId && ACTIVE_RESERVATION_STATUSES.includes(reservation.status)
  );
  if (hasActiveReservation) {
    return state;
  }

  const now = new Date().toISOString();
  return {
    ...state,
    listings: state.listings.map((item) =>
      item.id === listingId ? { ...item, status, updatedAt: now } : item
    )
  };
}

export function updateListingDetails(
  state: AppState,
  listingId: string,
  sellerId: string,
  draft: ListingDraft
): AppState {
  const listing = state.listings.find((item) => item.id === listingId);
  if (!listing || listing.sellerId !== sellerId || listing.status === "sold" || listing.status === "reserved") {
    return state;
  }
  if (!isValidListingDraft(draft)) return state;

  const now = new Date().toISOString();
  return {
    ...state,
    listings: state.listings.map((item) =>
      item.id === listingId
        ? {
            ...item,
            title: draft.title.trim(),
            description: draft.description.trim(),
            price: draft.price,
            category: draft.category.trim(),
            condition: draft.condition,
            location: draft.location.trim(),
            updatedAt: now,
            items: normalizeDraftItems(draft, listingId, now),
            images: draft.images.map((image, index) => ({
              ...image,
              primary: index === 0
            }))
          }
        : item
    )
  };
}

export function reserveListing(state: AppState, listingId: string, buyerId: string): AppState {
  const listing = state.listings.find((item) => item.id === listingId);
  if (!listing || listing.status !== "available" || listing.sellerId === buyerId) {
    return state;
  }

  const now = new Date();
  const reservation: Reservation = {
    id: createId("reservation"),
    listingId,
    buyerId,
    sellerId: listing.sellerId,
    status: "awaiting_payment",
    paymentDueAt: new Date(now.getTime() + DAY_MS).toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  const notification: Notification = {
    id: createId("notification"),
    userId: listing.sellerId,
    type: "reservation_created",
    title: "New reservation",
    body: `${getUserName(state, buyerId)} reserved ${listing.title}.`,
    entityId: reservation.id,
    createdAt: now.toISOString()
  };

  return {
    ...state,
    listings: state.listings.map((item) =>
      item.id === listingId ? { ...item, status: "reserved", updatedAt: now.toISOString() } : item
    ),
    reservations: [reservation, ...state.reservations],
    notifications: [notification, ...state.notifications]
  };
}

export function sendMessage(
  state: AppState,
  reservationId: string,
  senderId: string,
  body: string
): AppState {
  const reservation = state.reservations.find((item) => item.id === reservationId);
  const trimmed = body.trim();
  if (!reservation || !trimmed || !canAccessReservation(reservation, senderId)) {
    return state;
  }

  const now = new Date().toISOString();
  const receiverId = reservation.sellerId === senderId ? reservation.buyerId : reservation.sellerId;
  const listing = state.listings.find((item) => item.id === reservation.listingId);
  const message: Message = {
    id: createId("message"),
    reservationId,
    senderId,
    body: trimmed,
    createdAt: now
  };
  const notification: Notification = {
    id: createId("notification"),
    userId: receiverId,
    type: "message_received",
    title: "New message",
    body: `${getUserName(state, senderId)} sent a message about ${listing?.title ?? "a listing"}.`,
    entityId: reservationId,
    createdAt: now
  };

  return {
    ...state,
    messages: [...state.messages, message],
    notifications: [notification, ...state.notifications]
  };
}

export function updateReservationStatus(
  state: AppState,
  reservationId: string,
  actorId: string,
  status: Reservation["status"]
): AppState {
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!reservation || !canAccessReservation(reservation, actorId)) return state;
  if (["paid", "sold", "cancelled"].includes(reservation.status)) return state;
  if (status === "paid" || status === "sold") {
    if (actorId !== reservation.sellerId) return state;
  }
  if (status === "payment_sent" && actorId !== reservation.buyerId) return state;

  const now = new Date().toISOString();
  const nextListings = state.listings.map((listing) => {
    if (listing.id !== reservation.listingId) return listing;
    if (status === "sold" || status === "paid") {
      return { ...listing, status: "sold" as const, updatedAt: now };
    }
    if (status === "cancelled") {
      return { ...listing, status: "available" as const, updatedAt: now };
    }
    return listing;
  });

  const notifications =
    status === "paid"
      ? [
          {
            id: createId("notification"),
            userId: reservation.buyerId,
            type: "payment_paid" as const,
            title: "Payment confirmed",
            body: "The seller marked your off-platform payment as received.",
            entityId: reservationId,
            createdAt: now
          },
          ...state.notifications
        ]
      : state.notifications;

  return {
    ...state,
    listings: nextListings,
    reservations: state.reservations.map((item) =>
      item.id === reservationId ? { ...item, status, updatedAt: now } : item
    ),
    notifications
  };
}

export function computeOverdueNotifications(state: AppState, now = new Date()): AppState {
  const createdNotifications: Notification[] = [];
  const reservations = state.reservations.map((reservation) => {
    const shouldNotify =
      reservation.status === "awaiting_payment" &&
      !reservation.overdueNotifiedAt &&
      new Date(reservation.paymentDueAt).getTime() <= now.getTime();

    if (!shouldNotify) return reservation;

    const listing = state.listings.find((item) => item.id === reservation.listingId);
    const timestamp = now.toISOString();
    createdNotifications.push(
      {
        id: createId("notification"),
        userId: reservation.buyerId,
        type: "payment_overdue",
        title: "Payment overdue",
        body: `Payment is overdue for ${listing?.title ?? "your reserved item"}.`,
        entityId: reservation.id,
        createdAt: timestamp
      },
      {
        id: createId("notification"),
        userId: reservation.sellerId,
        type: "payment_overdue",
        title: "Payment overdue",
        body: `${getUserName(state, reservation.buyerId)} has not been marked paid for ${
          listing?.title ?? "a reserved item"
        }.`,
        entityId: reservation.id,
        createdAt: timestamp
      }
    );

    return {
      ...reservation,
      status: "overdue" as const,
      overdueNotifiedAt: timestamp,
      updatedAt: timestamp
    };
  });

  if (createdNotifications.length === 0) return state;

  return {
    ...state,
    reservations,
    notifications: [...createdNotifications, ...state.notifications]
  };
}

export function canAccessReservation(reservation: Reservation, userId: string): boolean {
  return reservation.buyerId === userId || reservation.sellerId === userId;
}

export function getUserName(state: AppState, userId: string): string {
  return state.users.find((user) => user.id === userId)?.name ?? "Someone";
}

function normalizeAppState(state: AppState): AppState {
  const profiles = state.profiles ?? state.users.map(createProfileFromUser);

  return {
    ...state,
    listings: state.listings.map(normalizeListing),
    accounts: state.accounts ?? [],
    profiles
  };
}

function normalizeListing(listing: Listing): Listing {
  return {
    ...listing,
    items: normalizeListingItems(listing)
  };
}

function normalizeListingItems(listing: Listing): ListingItem[] {
  const rawItems = Array.isArray(listing.items) ? listing.items : [];
  const normalized = rawItems
    .map((item, index) => normalizeListingItem(item, listing, index))
    .filter((item): item is ListingItem => Boolean(item));

  if (normalized.length > 0) return normalized;

  return [
    {
      id: `${listing.id}-item-1`,
      listingId: listing.id,
      name: listing.title.trim() || "Item",
      price: listing.price,
      condition: listing.condition,
      notes: listing.description.trim() || undefined,
      position: 0,
      createdAt: listing.createdAt
    }
  ];
}

function normalizeDraftItems(draft: ListingDraft, listingId: string, createdAt: string): ListingItem[] {
  const draftListing: Listing = {
    id: listingId,
    sellerId: "",
    title: draft.title,
    description: draft.description,
    price: draft.price,
    category: draft.category,
    condition: draft.condition,
    location: draft.location,
    images: draft.images,
    items: Array.isArray(draft.items) ? draft.items : [],
    status: "available",
    createdAt,
    updatedAt: createdAt
  };
  return normalizeListingItems(draftListing);
}

function draftItems(draft: ListingDraft): ListingItem[] {
  return Array.isArray(draft.items) ? draft.items : [];
}

function hasItemContent(item: ListingItem): boolean {
  return Boolean(
    item.name?.trim() ||
      item.notes?.trim() ||
      (Number.isFinite(item.price) && Number(item.price) > 0) ||
      item.condition
  );
}

function hasValidDraftItems(draft: ListingDraft): boolean {
  const items = draftItems(draft);
  return (
    items.length <= MAX_LISTING_ITEMS &&
    items.every((item) => !hasItemContent(item) || Boolean(item.name?.trim()))
  );
}

function normalizeListingItem(item: ListingItem, listing: Listing, index: number): ListingItem | undefined {
  const name = item.name?.trim();
  if (!name) return undefined;

  const notes = item.notes?.trim();
  const price = Number.isFinite(item.price) && Number(item.price) > 0 ? Number(item.price) : undefined;
  const condition = item.condition && LISTING_CONDITIONS.has(item.condition) ? item.condition : undefined;

  return {
    id: item.id || createId("item"),
    listingId: listing.id,
    name,
    price,
    condition,
    notes: notes || undefined,
    position: index,
    createdAt: item.createdAt || listing.createdAt
  };
}

function createProfileFromUser(user: AppState["users"][number]) {
  const now = new Date().toISOString();
  return {
    userId: user.id,
    displayName: user.name,
    bio: "",
    location: "",
    createdAt: now,
    updatedAt: now
  };
}

function migrateAppState(stored: unknown): AppState {
  return isAppState(stored) ? normalizeAppState(stored) : seedState;
}

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  return (
    Array.isArray(candidate.users) &&
    typeof candidate.activeUserId === "string" &&
    Array.isArray(candidate.listings) &&
    Array.isArray(candidate.reservations) &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.notifications)
  );
}

function accountError(state: AppState, error: AccountActionError, message: string): AccountActionResult {
  return {
    ok: false,
    state,
    error,
    message
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createLocalPasswordHash(email: string, password: string): string {
  let hash = 2166136261;
  const input = `${normalizeEmail(email)}:${password}`;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `local-v1:${(hash >>> 0).toString(36)}`;
}
