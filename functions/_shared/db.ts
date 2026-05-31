import {
  MAX_LISTING_ITEMS,
  type AppState,
  type Listing,
  type ListingCondition,
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
  pickup_zip?: string | null;
  service_area_miles?: number | null;
  pickup_policy?: string | null;
  handoff_policy?: string | null;
  cancellation_policy?: string | null;
  off_platform_instructions?: string | null;
  response_expectation?: string | null;
  seller_activated_at?: string | null;
  email_notifications_enabled?: number | null;
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
  cancelled_at?: string | null;
  cancelled_by_user_id?: string | null;
  cancellation_reason?: string | null;
  cancellation_note?: string | null;
  recovery_state?: Reservation["recoveryState"] | null;
  handoff_method?: Reservation["handoffMethod"] | null;
  handoff_window?: string | null;
  handoff_location?: string | null;
  handoff_tracking?: string | null;
  handoff_note?: string | null;
  buyer_confirmed_at?: string | null;
  seller_confirmed_at?: string | null;
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
  dedupe_key?: string | null;
  created_at: string;
};

export type ReservationStatusUpdate = {
  status: ReservationStatus;
  reason?: string;
  note?: string;
  recoveryAction?: "relist" | "pause";
};

export type ReservationHandoffDraft = {
  handoffMethod?: Reservation["handoffMethod"];
  handoffWindow?: string;
  handoffLocation?: string;
  handoffTracking?: string;
  handoffNote?: string;
  confirmBuyer?: boolean;
  confirmSeller?: boolean;
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
  await markExpiredReservationHolds(db);

  const [users, listings, images, items] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, role, email_verified_at, phone_verified_at, pickup_area, pickup_zip,
                service_area_miles, pickup_policy, handoff_policy, cancellation_policy,
                off_platform_instructions, response_expectation, seller_activated_at,
                email_notifications_enabled, bio, avatar_url
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
      pickupZip: row.pickup_zip ?? undefined,
      serviceAreaMiles: row.service_area_miles ?? undefined,
      pickupPolicy: row.pickup_policy ?? undefined,
      handoffPolicy: row.handoff_policy ?? undefined,
      cancellationPolicy: row.cancellation_policy ?? undefined,
      offPlatformInstructions: row.off_platform_instructions ?? undefined,
      responseExpectation: row.response_expectation ?? undefined,
      sellerActivatedAt: row.seller_activated_at ?? undefined,
      emailNotificationsEnabled: row.email_notifications_enabled !== 0,
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
      cancelledAt: row.cancelled_at ?? undefined,
      cancelledByUserId: row.cancelled_by_user_id ?? undefined,
      cancellationReason: row.cancellation_reason ?? undefined,
      cancellationNote: row.cancellation_note ?? undefined,
      recoveryState: row.recovery_state ?? undefined,
      handoffMethod: row.handoff_method ?? undefined,
      handoffWindow: row.handoff_window ?? undefined,
      handoffLocation: row.handoff_location ?? undefined,
      handoffTracking: row.handoff_tracking ?? undefined,
      handoffNote: row.handoff_note ?? undefined,
      buyerConfirmedAt: row.buyer_confirmed_at ?? undefined,
      sellerConfirmedAt: row.seller_confirmed_at ?? undefined,
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
      dedupeKey: row.dedupe_key ?? undefined,
      createdAt: row.created_at
    }))
  };
}

export async function createListingInDb(env: Env, sellerId: string, draft: ListingDraft) {
  const db = env.DB;
  const seller = await db
    .prepare(
      `SELECT id, role, pickup_zip, service_area_miles, pickup_policy, handoff_policy,
              pickup_area, off_platform_instructions, cancellation_policy, response_expectation, seller_activated_at
       FROM users
       WHERE id = ?`
    )
    .bind(sellerId)
    .first<UserRow>();
  if (!seller) {
    throw new ApiError("Log in to create listings.", 401);
  }
  if (!isSellerReady(seller)) {
    throw new ApiError("Complete seller setup before publishing a listing.", 403);
  }
  validateListingDraft(draft);

  const now = new Date().toISOString();
  const listingId = createId("listing");
  const items = normalizeDraftItems(draft, listingId, now);
  const listingPrice = getListingTotalPrice(items);
  const listingCondition = getListingSummaryCondition(items);
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
        listingPrice,
        draft.category,
        listingCondition,
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

  const now = new Date().toISOString();
  const items = normalizeDraftItems(draft, listingId, now);
  const listingPrice = getListingTotalPrice(items);
  const listingCondition = getListingSummaryCondition(items);
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
         AND status IN ('available', 'paused', 'reserved')`
    )
    .bind(
      draft.title.trim(),
      draft.description.trim(),
      listingPrice,
      draft.category.trim(),
      listingCondition,
      draft.location.trim(),
      now,
      listingId,
      sellerId
    )
    .run();

  if (!result.meta.changes) {
    throw new ApiError("Listing cannot be edited.", 409);
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
  if (listing.status !== "available") throw new ApiError("Listing is not available for new buyer interest.", 409);

  const existing = await db
    .prepare(
      `SELECT id
       FROM reservations
       WHERE listing_id = ?
         AND buyer_id = ?
         AND status IN ('requested', 'awaiting_payment', 'payment_sent', 'overdue')
       LIMIT 1`
    )
    .bind(listingId, buyerId)
    .first<{ id: string }>();
  if (existing) return;

  const now = new Date();
  const reservationId = createId("reservation");
  const holdExpiresAt = new Date(now.getTime() + DAY_MS).toISOString();

	  await db.batch([
	    db
	      .prepare(
        `INSERT INTO reservations (
          id, listing_id, buyer_id, seller_id, status, payment_due_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'requested', ?, ?, ?)`
	      )
	      .bind(reservationId, listingId, buyerId, listing.seller_id, holdExpiresAt, now.toISOString(), now.toISOString()),
	    db
	      .prepare(
	        `INSERT INTO notifications (id, user_id, type, title, body, entity_id, created_at)
	         VALUES (?, ?, 'reservation_created', 'New buyer interest', ?, ?, ?)`
	      )
	      .bind(
	        createId("notification"),
	        listing.seller_id,
	        `${await getUserName(db, buyerId)} is interested in ${listing.title}.`,
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

  const now = new Date().toISOString();
	  const result = await db
	    .prepare(
	      `UPDATE listings
       SET status = ?, updated_at = ?
       WHERE id = ?
         AND seller_id = ?
         AND status IN ('available', 'paused', 'reserved')`
	    )
    .bind(status, now, listingId, sellerId)
    .run();

  if (!result.meta.changes) {
    throw new ApiError("Listing status could not be changed.", 409);
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
  update: ReservationStatus | ReservationStatusUpdate
) {
  const status = typeof update === "string" ? update : update.status;
  const reservation = await getReservationForParticipant(db, reservationId, actorId);
  if (TERMINAL_RESERVATION_STATUSES.has(reservation.status)) {
    throw new ApiError("Terminal reservations cannot be changed.", 409);
  }
  if (status !== "sold" && status !== "cancelled") {
    throw new ApiError("Reservation status can only be completed or cancelled.", 400);
  }
  if (status === "sold" && actorId !== reservation.seller_id) {
    throw new ApiError("Only the seller can complete the handoff.", 403);
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  if (status === "sold") {
    statements.push(
      db
        .prepare("UPDATE reservations SET status = ?, seller_confirmed_at = COALESCE(seller_confirmed_at, ?), updated_at = ? WHERE id = ?")
        .bind(status, now, now, reservationId)
    );
    statements.push(
      db
        .prepare("UPDATE listings SET status = 'sold', updated_at = ? WHERE id = ?")
        .bind(now, reservation.listing_id)
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, type, title, body, entity_id, created_at)
           VALUES (?, ?, 'payment_paid', 'Handoff complete', ?, ?, ?)`
        )
        .bind(
          createId("notification"),
          reservation.buyer_id,
          "The seller marked your reservation as complete.",
          reservationId,
          now
        )
    );
  }

  if (status === "cancelled") {
    const details: Partial<ReservationStatusUpdate> = typeof update === "string" ? {} : update;
    const reason = normalizeCancellationReason(details.reason);
    const note = details.note?.trim() ?? "";
    const recoveryState = details.recoveryAction === "pause" ? "closed" : "none";
    const receiverId = reservation.seller_id === actorId ? reservation.buyer_id : reservation.seller_id;
    const [listingTitle, actorName] = await Promise.all([
      getListingTitle(db, reservation.listing_id),
      getUserName(db, actorId)
    ]);
    const notificationBody = `${actorName} cancelled the conversation for ${listingTitle}: ${formatCancellationReason(
      reason
    )}.`;
    statements.push(
      db
        .prepare(
          `UPDATE reservations
           SET status = ?,
               cancelled_at = ?,
               cancelled_by_user_id = ?,
               cancellation_reason = ?,
               cancellation_note = ?,
               recovery_state = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .bind(status, now, actorId, reason, note || null, recoveryState, now, reservationId)
    );
    statements.push(
      db
        .prepare("INSERT INTO messages (id, reservation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(createId("message"), reservationId, actorId, notificationBody, now)
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, type, title, body, entity_id, created_at)
           VALUES (?, ?, 'reservation_cancelled', 'Conversation cancelled', ?, ?, ?)`
        )
        .bind(createId("notification"), receiverId, notificationBody, reservationId, now)
    );
  }

  await db.batch(statements);
}

export async function updateReservationHandoffInDb(
  db: D1Database,
  reservationId: string,
  actorId: string,
  draft: ReservationHandoffDraft
) {
  const reservation = await getReservationForParticipant(db, reservationId, actorId);
  if (TERMINAL_RESERVATION_STATUSES.has(reservation.status)) {
    throw new ApiError("Terminal reservations cannot be changed.", 409);
  }
  const method = normalizeHandoffMethod(draft.handoffMethod);
  const now = new Date().toISOString();
  const handoffWindow = draft.handoffWindow?.trim() ?? "";
  const handoffLocation = draft.handoffLocation?.trim() ?? "";
  const handoffTracking = draft.handoffTracking?.trim() ?? "";
  const handoffNote = draft.handoffNote?.trim() ?? "";
  const primaryDetail = method === "shipping" ? handoffTracking : handoffLocation;
  if (!handoffWindow || !primaryDetail) {
    throw new ApiError("Handoff window and pickup or shipping details are required.", 400);
  }
  const buyerConfirmedAt =
    draft.confirmBuyer && actorId === reservation.buyer_id ? now : reservation.buyer_confirmed_at ?? null;
  const sellerConfirmedAt =
    draft.confirmSeller && actorId === reservation.seller_id ? now : reservation.seller_confirmed_at ?? null;
  const receiverId = reservation.seller_id === actorId ? reservation.buyer_id : reservation.seller_id;
  const [listingTitle, actorName] = await Promise.all([
    getListingTitle(db, reservation.listing_id),
    getUserName(db, actorId)
  ]);
  const summary = `${actorName} updated handoff details for ${listingTitle}.`;

  await db.batch([
    db
      .prepare(
        `UPDATE reservations
         SET status = 'payment_sent',
             handoff_method = ?,
             handoff_window = ?,
             handoff_location = ?,
             handoff_tracking = ?,
             handoff_note = ?,
             buyer_confirmed_at = ?,
             seller_confirmed_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(
        method,
        handoffWindow || null,
        handoffLocation || null,
        handoffTracking || null,
        handoffNote || null,
        buyerConfirmedAt,
        sellerConfirmedAt,
        now,
        reservationId
      ),
    db
      .prepare("INSERT INTO messages (id, reservation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(createId("message"), reservationId, actorId, summary, now),
    db
      .prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, entity_id, created_at)
         VALUES (?, ?, 'message_received', 'Handoff updated', ?, ?, ?)`
      )
      .bind(createId("notification"), receiverId, summary, reservationId, now)
  ]);
}

export async function markNotificationsReadInDb(db: D1Database, userId: string) {
  await db
    .prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?")
    .bind(new Date().toISOString(), userId)
    .run();
}

async function markExpiredReservationHolds(db: D1Database) {
  const now = new Date().toISOString();
  const expiredHolds = await db
    .prepare(
      `SELECT r.*, l.title, u.name AS buyer_name
       FROM reservations r
       JOIN listings l ON l.id = r.listing_id
       JOIN users u ON u.id = r.buyer_id
       WHERE r.status IN ('requested', 'awaiting_payment', 'payment_sent')
         AND r.overdue_notified_at IS NULL
         AND r.payment_due_at <= ?`
    )
    .bind(now)
    .all<ReservationRow & { title: string; buyer_name: string }>();

  for (const reservation of expiredHolds.results) {
    const updated = await db
      .prepare(
        `UPDATE reservations
         SET status = 'overdue', overdue_notified_at = ?, updated_at = ?
         WHERE id = ? AND status IN ('requested', 'awaiting_payment', 'payment_sent') AND overdue_notified_at IS NULL`
      )
      .bind(now, now, reservation.id)
      .run();

    if (!updated.meta.changes) continue;

	    await db.batch([
	      db
	        .prepare(
	          `INSERT OR IGNORE INTO notifications (
	             id, user_id, type, title, body, entity_id, dedupe_key, created_at
	           ) VALUES (?, ?, 'payment_overdue', 'Follow-up due', ?, ?, ?, ?)`
	        )
	        .bind(
	          createId("notification"),
	          reservation.buyer_id,
	          `Follow up about ${reservation.title}.`,
	          reservation.id,
	          `reservation:${reservation.id}:hold_expired:buyer`,
	          now
	        ),
	      db
	        .prepare(
	          `INSERT OR IGNORE INTO notifications (
	             id, user_id, type, title, body, entity_id, dedupe_key, created_at
	           ) VALUES (?, ?, 'payment_overdue', 'Follow-up due', ?, ?, ?, ?)`
	        )
	        .bind(
	          createId("notification"),
	          reservation.seller_id,
	          `${reservation.buyer_name} may need a reply about ${reservation.title}.`,
	          reservation.id,
	          `reservation:${reservation.id}:hold_expired:seller`,
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

async function getListingTitle(db: D1Database, listingId: string) {
  const listing = await db.prepare("SELECT title FROM listings WHERE id = ?").bind(listingId).first<{ title: string }>();
  return listing?.title ?? "a listing";
}

function normalizeCancellationReason(reason?: string) {
  const normalized = reason?.trim() ?? "";
  if (
    [
      "buyer_changed_mind",
      "buyer_unreachable",
      "seller_unavailable",
      "handoff_timing_failed",
      "listing_unavailable",
      "other"
    ].includes(normalized)
  ) {
    return normalized;
  }
  return normalized || "other";
}

function formatCancellationReason(reason: string) {
  const labels: Record<string, string> = {
    buyer_changed_mind: "Buyer no longer wants it",
    buyer_unreachable: "Buyer unreachable",
    seller_unavailable: "Seller unavailable",
    handoff_timing_failed: "Handoff timing failed",
    listing_unavailable: "Listing unavailable or damaged",
    other: "Other"
  };
  return labels[reason] ?? reason;
}

function normalizeHandoffMethod(method?: Reservation["handoffMethod"]) {
  return method === "shipping" ? "shipping" : "pickup";
}

function isSellerReady(seller: UserRow) {
  return Boolean(seller.pickup_area?.trim() && seller.cancellation_policy?.trim());
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

const CONDITION_RANK: Record<ListingCondition, number> = {
  fair: 0,
  good: 1,
  like_new: 2,
  new: 3
};

function getListingTotalPrice(items: ListingItem[]): number {
  return items.reduce((total, item) => total + (Number.isFinite(item.price) ? Number(item.price) : 0), 0);
}

function getListingSummaryCondition(items: ListingItem[]): ListingCondition {
  return items.reduce<ListingCondition>((summary, item) => {
    if (!item.condition) return summary;
    return CONDITION_RANK[item.condition] < CONDITION_RANK[summary] ? item.condition : summary;
  }, "new");
}

function validateListingDraft(draft: ListingDraft) {
  const items = normalizeDraftItems(draft, "validation-listing", new Date().toISOString());
  const rawItems = draftItems(draft);
  if (
    !draft.title.trim() ||
    !draft.description.trim() ||
    !draft.location.trim() ||
    !draft.category.trim()
  ) {
    throw new ApiError("Listing title, description, location, and category are required.");
  }
  if (draft.images.length === 0 || draft.images.length > 6) {
    throw new ApiError("Listings must include 1-6 images.");
  }
  if (rawItems.length === 0) {
    throw new ApiError("Listings must include at least one item.");
  }
  if (rawItems.length > MAX_LISTING_ITEMS) {
    throw new ApiError(`Listings must include no more than ${MAX_LISTING_ITEMS} items.`);
  }
  if (rawItems.some((item) => !item.name?.trim())) {
    throw new ApiError("Every listing item must include a name.");
  }
  if (rawItems.some((item) => !Number.isFinite(item.price) || Number(item.price) <= 0)) {
    throw new ApiError("Every listing item must include a price.");
  }
  if (rawItems.some((item) => !item.condition || !LISTING_CONDITIONS.has(item.condition))) {
    throw new ApiError("Every listing item must include a valid condition.");
  }
  if (items.length === 0) {
    throw new ApiError("Listings must include at least one item.");
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
