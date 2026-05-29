import {
  MAX_LISTING_ITEMS,
  type AppState,
  type Listing,
  type ListingDraft,
  type ListingImage,
  type ListingItem,
  type ListingStatus,
  type Message,
  type Notification,
  type Reservation,
  type ReservationStatus,
  type User
} from "../../src/data/types";
import { ApiError } from "./http";

const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL_RESERVATION_STATUSES = new Set<ReservationStatus>(["paid", "sold", "cancelled"]);
const OWNER_LISTING_STATUSES = new Set<ListingStatus>(["available", "paused", "sold"]);
const LISTING_CONDITIONS = new Set<Listing["condition"]>(["new", "like_new", "good", "fair"]);

export type Env = {
  DB: D1Database;
  CHAT_USER_HUB?: DurableObjectNamespace;
  LISTING_IMAGES?: R2Bucket;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
};

type UserRow = {
  id: string;
  name: string;
  role: User["role"];
  email_verified_at?: string | null;
  phone_verified_at?: string | null;
  pickup_area?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
};

type ListingRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: Listing["condition"];
  location: string;
  status: Listing["status"];
  created_at: string;
  updated_at: string;
};

type ListingImageRow = {
  id: string;
  listing_id: string;
  name: string;
  data_url: string;
  r2_key?: string | null;
  is_primary: number;
  created_at: string;
};

type ListingItemRow = {
  id: string;
  listing_id: string;
  name: string;
  price?: number | null;
  condition?: Listing["condition"] | null;
  notes?: string | null;
  position: number;
  created_at: string;
};

type ReservationRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: ReservationStatus;
  payment_due_at: string;
  overdue_notified_at?: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  reservation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  type: Notification["type"];
  title: string;
  body: string;
  entity_id?: string | null;
  read_at?: string | null;
  created_at: string;
};

export type SendMessageResult = {
  message: Message;
  notification: Notification;
  participantUserIds: string[];
};

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

type StateUser = {
  id: string;
};

export async function readState(db: D1Database, currentUser?: StateUser): Promise<AppState> {
  await markOverdueReservations(db);

  const [users, listings, images, items] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, role, email_verified_at, phone_verified_at, pickup_area, bio, avatar_url
         FROM users
         ORDER BY created_at, name`
      )
      .all<UserRow>(),
    db.prepare("SELECT * FROM listings ORDER BY created_at DESC").all<ListingRow>(),
    db.prepare("SELECT * FROM listing_images ORDER BY created_at").all<ListingImageRow>(),
    db.prepare("SELECT * FROM listing_items ORDER BY listing_id, position, created_at").all<ListingItemRow>()
  ]);
  const reservations = currentUser
    ? await db
        .prepare(
          `SELECT * FROM reservations
           WHERE buyer_id = ? OR seller_id = ?
           ORDER BY created_at DESC`
        )
        .bind(currentUser.id, currentUser.id)
        .all<ReservationRow>()
    : { results: [] as ReservationRow[] };
  const reservationIds = reservations.results.map((row) => row.id);
  const messages =
    reservationIds.length > 0
      ? await db
          .prepare(
            `SELECT * FROM messages
             WHERE reservation_id IN (${reservationIds.map(() => "?").join(",")})
             ORDER BY created_at`
          )
          .bind(...reservationIds)
          .all<MessageRow>()
      : { results: [] as MessageRow[] };
  const notifications = currentUser
    ? await db
        .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC")
        .bind(currentUser.id)
        .all<NotificationRow>()
    : { results: [] as NotificationRow[] };

  const imagesByListing = new Map<string, ListingImage[]>();
  for (const row of images.results) {
    const listingImages = imagesByListing.get(row.listing_id) ?? [];
    listingImages.push({
      id: row.id,
      name: row.name,
      dataUrl: row.data_url,
      primary: row.is_primary === 1,
      createdAt: row.created_at
    });
    imagesByListing.set(row.listing_id, listingImages);
  }

  const itemsByListing = new Map<string, ListingItem[]>();
  for (const row of items.results) {
    const listingItems = itemsByListing.get(row.listing_id) ?? [];
    listingItems.push({
      id: row.id,
      listingId: row.listing_id,
      name: row.name,
      price: row.price ?? undefined,
      condition: row.condition ?? undefined,
      notes: row.notes ?? undefined,
      position: row.position,
      createdAt: row.created_at
    });
    itemsByListing.set(row.listing_id, listingItems);
  }

  return {
    users: users.results.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      emailVerifiedAt: row.email_verified_at ?? undefined,
      phoneVerifiedAt: row.phone_verified_at ?? undefined,
      pickupArea: row.pickup_area ?? undefined,
      bio: row.bio ?? undefined,
      avatarUrl: row.avatar_url ?? undefined
    })),
    activeUserId: currentUser?.id ?? "",
    listings: listings.results.map((row) =>
      normalizeListingFromRow(row, imagesByListing.get(row.id) ?? [], itemsByListing.get(row.id) ?? [])
    ),
    reservations: reservations.results.map((row) => ({
      id: row.id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      status: row.status,
      paymentDueAt: row.payment_due_at,
      overdueNotifiedAt: row.overdue_notified_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    messages: messages.results.map((row) => ({
      id: row.id,
      reservationId: row.reservation_id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: row.created_at
    })),
    notifications: notifications.results.map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      body: row.body,
      entityId: row.entity_id ?? undefined,
      readAt: row.read_at ?? undefined,
      createdAt: row.created_at
    }))
  };
}

export async function createListingInDb(env: Env, sellerId: string, draft: ListingDraft) {
  const db = env.DB;
  const seller = await db.prepare("SELECT id, role FROM users WHERE id = ?").bind(sellerId).first<UserRow>();
  if (!seller) {
    throw new ApiError("Log in to create listings.", 401);
  }
  validateListingDraft(draft);

  const now = new Date().toISOString();
  const listingId = createId("listing");
  const items = normalizeDraftItems(draft, listingId, now);
  const images = await Promise.all(
    draft.images.map((image, index) => persistListingImage(env, listingId, image, index === 0, now))
  );
  await db.batch([
    db
      .prepare(
        `INSERT INTO listings (
          id, seller_id, title, description, price, category, condition, location, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`
      )
      .bind(
        listingId,
        sellerId,
        draft.title.trim(),
        draft.description.trim(),
        draft.price,
        draft.category,
        draft.condition,
        draft.location.trim(),
        now,
        now
      ),
    ...images.map((image) =>
      db
        .prepare(
          `INSERT INTO listing_images (id, listing_id, name, data_url, r2_key, is_primary, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          image.id,
          listingId,
          image.name,
          image.dataUrl,
          image.r2Key ?? null,
          image.primary ? 1 : 0,
          now
        )
    ),
    ...items.map((item) =>
      db
        .prepare(
          `INSERT INTO listing_items (id, listing_id, name, price, condition, notes, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          item.id,
          listingId,
          item.name,
          item.price ?? null,
          item.condition ?? null,
          item.notes ?? null,
          item.position,
          item.createdAt
        )
    )
  ]);
}

export async function updateListingInDb(env: Env, listingId: string, sellerId: string, draft: ListingDraft) {
  const db = env.DB;
  validateListingDraft(draft);

  const listing = await db
    .prepare("SELECT * FROM listings WHERE id = ? AND seller_id = ?")
    .bind(listingId, sellerId)
    .first<ListingRow>();
  if (!listing) throw new ApiError("Listing not found for this seller.", 404);
  if (listing.status === "sold") {
    throw new ApiError("Sold listings cannot be edited.", 409);
  }
  if (listing.status === "reserved") {
    throw new ApiError("Resolve the active reservation before editing this listing.", 409);
  }

  const now = new Date().toISOString();
  const items = normalizeDraftItems(draft, listingId, now);
  const images = await Promise.all(
    draft.images.map((image, index) => persistListingImage(env, listingId, image, index === 0, now))
  );
  const result = await db
    .prepare(
      `UPDATE listings
       SET title = ?,
           description = ?,
           price = ?,
           category = ?,
           condition = ?,
           location = ?,
           updated_at = ?
       WHERE id = ?
         AND seller_id = ?
         AND status IN ('available', 'paused')
         AND NOT EXISTS (
           SELECT 1
           FROM reservations
           WHERE listing_id = ?
             AND status IN ('requested', 'awaiting_payment', 'payment_sent', 'overdue')
         )`
    )
    .bind(
      draft.title.trim(),
      draft.description.trim(),
      draft.price,
      draft.category.trim(),
      draft.condition,
      draft.location.trim(),
      now,
      listingId,
      sellerId,
      listingId
    )
    .run();

  if (!result.meta.changes) {
    throw new ApiError("Resolve the active reservation before editing this listing.", 409);
  }

  await db.batch([
    db.prepare("DELETE FROM listing_images WHERE listing_id = ?").bind(listingId),
    db.prepare("DELETE FROM listing_items WHERE listing_id = ?").bind(listingId),
    ...images.map((image) =>
      db
        .prepare(
          `INSERT INTO listing_images (id, listing_id, name, data_url, r2_key, is_primary, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          image.id,
          listingId,
          image.name,
          image.dataUrl,
          image.r2Key ?? null,
          image.primary ? 1 : 0,
          now
        )
    ),
    ...items.map((item) =>
      db
        .prepare(
          `INSERT INTO listing_items (id, listing_id, name, price, condition, notes, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          item.id,
          listingId,
          item.name,
          item.price ?? null,
          item.condition ?? null,
          item.notes ?? null,
          item.position,
          item.createdAt
        )
    )
  ]);
}

export async function reserveListingInDb(db: D1Database, listingId: string, buyerId: string) {
  const listing = await db.prepare("SELECT * FROM listings WHERE id = ?").bind(listingId).first<ListingRow>();
  if (!listing) throw new ApiError("Listing not found.", 404);
  if (listing.seller_id === buyerId) throw new ApiError("Sellers cannot reserve their own listings.", 403);

  const now = new Date();
  const reservationId = createId("reservation");
  const paymentDueAt = new Date(now.getTime() + DAY_MS).toISOString();
  const updated = await db
    .prepare(
      "UPDATE listings SET status = 'reserved', updated_at = ? WHERE id = ? AND status = 'available' AND seller_id != ?"
    )
    .bind(now.toISOString(), listingId, buyerId)
    .run();

  if (!updated.meta.changes) {
    throw new ApiError("Listing is no longer available.", 409);
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO reservations (
          id, listing_id, buyer_id, seller_id, status, payment_due_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'awaiting_payment', ?, ?, ?)`
      )
      .bind(reservationId, listingId, buyerId, listing.seller_id, paymentDueAt, now.toISOString(), now.toISOString()),
    db
      .prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, entity_id, created_at)
         VALUES (?, ?, 'reservation_created', 'New reservation', ?, ?, ?)`
      )
      .bind(
        createId("notification"),
        listing.seller_id,
        `${await getUserName(db, buyerId)} reserved ${listing.title}.`,
        reservationId,
        now.toISOString()
      )
  ]);
}

export async function updateListingStatusInDb(
  db: D1Database,
  listingId: string,
  sellerId: string,
  status: ListingStatus
) {
  if (!OWNER_LISTING_STATUSES.has(status) || status === "reserved") {
    throw new ApiError("Listing status must be available, paused, or sold.");
  }

  const listing = await db
    .prepare("SELECT * FROM listings WHERE id = ? AND seller_id = ?")
    .bind(listingId, sellerId)
    .first<ListingRow>();
  if (!listing) throw new ApiError("Listing not found for this seller.", 404);
  if (listing.status === "sold") {
    throw new ApiError("Sold listings cannot be changed.", 409);
  }
  if (listing.status === "reserved") {
    throw new ApiError("Resolve the active reservation before changing this listing.", 409);
  }

  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE listings
       SET status = ?, updated_at = ?
       WHERE id = ?
         AND seller_id = ?
         AND status IN ('available', 'paused')
         AND NOT EXISTS (
           SELECT 1
           FROM reservations
           WHERE listing_id = ?
             AND status IN ('requested', 'awaiting_payment', 'payment_sent', 'overdue')
         )`
    )
    .bind(status, now, listingId, sellerId, listingId)
    .run();

  if (!result.meta.changes) {
    throw new ApiError("Resolve the active reservation before changing this listing availability.", 409);
  }
}

export async function sendMessageInDb(
  db: D1Database,
  reservationId: string,
  senderId: string,
  body: string
): Promise<SendMessageResult> {
  const trimmed = body.trim();
  if (!trimmed) throw new ApiError("Message body is required.");

  const reservation = await getReservationForParticipant(db, reservationId, senderId);
  const listing = await db
    .prepare("SELECT title FROM listings WHERE id = ?")
    .bind(reservation.listing_id)
    .first<{ title: string }>();
  const now = new Date().toISOString();
  const messageId = createId("message");
  const notificationId = createId("notification");
  const receiverId = reservation.seller_id === senderId ? reservation.buyer_id : reservation.seller_id;
  const notificationBody = `${await getUserName(db, senderId)} sent a message about ${
    listing?.title ?? "a listing"
  }.`;

  await db.batch([
    db
      .prepare("INSERT INTO messages (id, reservation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(messageId, reservationId, senderId, trimmed, now),
    db
      .prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, entity_id, created_at)
         VALUES (?, ?, 'message_received', 'New message', ?, ?, ?)`
      )
      .bind(notificationId, receiverId, notificationBody, reservationId, now)
  ]);

  return {
    message: {
      id: messageId,
      reservationId,
      senderId,
      body: trimmed,
      createdAt: now
    },
    notification: {
      id: notificationId,
      userId: receiverId,
      type: "message_received",
      title: "New message",
      body: notificationBody,
      entityId: reservationId,
      createdAt: now
    },
    participantUserIds: [reservation.buyer_id, reservation.seller_id]
  };
}

export async function updateReservationStatusInDb(
  db: D1Database,
  reservationId: string,
  actorId: string,
  status: ReservationStatus
) {
  const reservation = await getReservationForParticipant(db, reservationId, actorId);
  if (TERMINAL_RESERVATION_STATUSES.has(reservation.status)) {
    throw new ApiError("Terminal reservations cannot be changed.", 409);
  }
  if ((status === "paid" || status === "sold") && actorId !== reservation.seller_id) {
    throw new ApiError("Only the seller can mark payment as paid.", 403);
  }
  if (status === "payment_sent" && actorId !== reservation.buyer_id) {
    throw new ApiError("Only the buyer can mark payment sent.", 403);
  }

  const now = new Date().toISOString();
  const statements = [
    db
      .prepare("UPDATE reservations SET status = ?, updated_at = ? WHERE id = ?")
      .bind(status, now, reservationId)
  ];

  if (status === "paid" || status === "sold") {
    statements.push(
      db
        .prepare("UPDATE listings SET status = 'sold', updated_at = ? WHERE id = ?")
        .bind(now, reservation.listing_id)
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, type, title, body, entity_id, created_at)
           VALUES (?, ?, 'payment_paid', 'Payment confirmed', ?, ?, ?)`
        )
        .bind(
          createId("notification"),
          reservation.buyer_id,
          "The seller marked your off-platform payment as received.",
          reservationId,
          now
        )
    );
  }

  if (status === "cancelled") {
    statements.push(
      db
        .prepare("UPDATE listings SET status = 'available', updated_at = ? WHERE id = ?")
        .bind(now, reservation.listing_id)
    );
  }

  await db.batch(statements);
}

export async function markNotificationsReadInDb(db: D1Database, userId: string) {
  await db
    .prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?")
    .bind(new Date().toISOString(), userId)
    .run();
}

async function markOverdueReservations(db: D1Database) {
  const now = new Date().toISOString();
  const overdue = await db
    .prepare(
      `SELECT r.*, l.title, u.name AS buyer_name
       FROM reservations r
       JOIN listings l ON l.id = r.listing_id
       JOIN users u ON u.id = r.buyer_id
       WHERE r.status = 'awaiting_payment'
         AND r.overdue_notified_at IS NULL
         AND r.payment_due_at <= ?`
    )
    .bind(now)
    .all<ReservationRow & { title: string; buyer_name: string }>();

  for (const reservation of overdue.results) {
    const updated = await db
      .prepare(
        `UPDATE reservations
         SET status = 'overdue', overdue_notified_at = ?, updated_at = ?
         WHERE id = ? AND status = 'awaiting_payment' AND overdue_notified_at IS NULL`
      )
      .bind(now, now, reservation.id)
      .run();

    if (!updated.meta.changes) continue;

    await db.batch([
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, type, title, body, entity_id, created_at)
           VALUES (?, ?, 'payment_overdue', 'Payment overdue', ?, ?, ?)`
        )
        .bind(
          createId("notification"),
          reservation.buyer_id,
          `Payment is overdue for ${reservation.title}.`,
          reservation.id,
          now
        ),
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, type, title, body, entity_id, created_at)
           VALUES (?, ?, 'payment_overdue', 'Payment overdue', ?, ?, ?)`
        )
        .bind(
          createId("notification"),
          reservation.seller_id,
          `${reservation.buyer_name} has not been marked paid for ${reservation.title}.`,
          reservation.id,
          now
        )
    ]);
  }
}

async function getReservationForParticipant(db: D1Database, reservationId: string, userId: string) {
  const reservation = await db
    .prepare("SELECT * FROM reservations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)")
    .bind(reservationId, userId, userId)
    .first<ReservationRow>();
  if (!reservation) throw new ApiError("Reservation not found for this user.", 404);
  return reservation;
}

async function getUserName(db: D1Database, userId: string) {
  const user = await db.prepare("SELECT name FROM users WHERE id = ?").bind(userId).first<{ name: string }>();
  return user?.name ?? "Someone";
}

function normalizeListingFromRow(row: ListingRow, images: ListingImage[], items: ListingItem[]): Listing {
  const listing: Listing = {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    description: row.description,
    price: row.price,
    category: row.category,
    condition: row.condition,
    location: row.location,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images,
    items
  };

  return {
    ...listing,
    items: normalizeListingItems(listing)
  };
}

function normalizeListingItems(listing: Listing): ListingItem[] {
  const normalized = listing.items
    .map((item, index) => normalizeListingItem(item, listing.id, listing.createdAt, index))
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
  const listing: Listing = {
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
  return normalizeListingItems(listing);
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

function normalizeListingItem(
  item: ListingItem,
  listingId: string,
  createdAt: string,
  index: number
): ListingItem | undefined {
  const name = item.name?.trim();
  if (!name) return undefined;

  const notes = item.notes?.trim();
  const price = Number.isFinite(item.price) && Number(item.price) > 0 ? Number(item.price) : undefined;
  const condition = item.condition && LISTING_CONDITIONS.has(item.condition) ? item.condition : undefined;

  return {
    id: item.id || createId("item"),
    listingId,
    name,
    price,
    condition,
    notes: notes || undefined,
    position: index,
    createdAt: item.createdAt || createdAt
  };
}

function validateListingDraft(draft: ListingDraft) {
  const items = normalizeDraftItems(draft, "validation-listing", new Date().toISOString());
  const rawItems = draftItems(draft);
  if (
    !draft.title.trim() ||
    !draft.description.trim() ||
    !draft.location.trim() ||
    !draft.category.trim() ||
    !Number.isFinite(draft.price) ||
    draft.price <= 0
  ) {
    throw new ApiError("Listing title, description, location, category, and price are required.");
  }
  if (!LISTING_CONDITIONS.has(draft.condition)) {
    throw new ApiError("Listing condition is invalid.");
  }
  if (draft.images.length === 0 || draft.images.length > 6) {
    throw new ApiError("Listings must include 1-6 images.");
  }
  if (rawItems.length > MAX_LISTING_ITEMS) {
    throw new ApiError(`Posts must include no more than ${MAX_LISTING_ITEMS} items.`);
  }
  if (rawItems.some((item) => hasItemContent(item) && !item.name?.trim())) {
    throw new ApiError("Every post item with details must include a name.");
  }
  if (items.length === 0) {
    throw new ApiError("Posts must include at least one item.");
  }
}

async function persistListingImage(
  env: Env,
  listingId: string,
  image: ListingImage,
  primary: boolean,
  createdAt: string
): Promise<ListingImage & { r2Key?: string }> {
  const id = image.id || createId("image");
  const parsed = parseBase64DataUrl(image.dataUrl);
  if (!env.LISTING_IMAGES || !parsed) {
    return {
      ...image,
      id,
      primary,
      createdAt
    };
  }

  const key = `${listingId}-${id}-${sanitizeFilename(image.name)}`;
  await env.LISTING_IMAGES.put(key, parsed.bytes, {
    httpMetadata: {
      contentType: parsed.contentType
    }
  });

  return {
    ...image,
    id,
    dataUrl: `/api/images/${encodeURIComponent(key)}`,
    primary,
    createdAt,
    r2Key: key
  };
}

function parseBase64DataUrl(dataUrl: string): { contentType: string; bytes: Uint8Array } | undefined {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return undefined;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return {
    contentType: match[1],
    bytes
  };
}

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
}
