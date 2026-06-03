import { describe, expect, it, vi } from "vitest";
import {
  createListingInDb,
  readState,
  reserveListingInDb,
  updateReservationHandoffInDb,
  updateReservationStatusInDb,
  type Env
} from "./db";
import { MAX_LISTING_ITEMS, type ListingDraft } from "../../src/data/types";

type FakeStatement = {
  sql: string;
  args: unknown[];
  bind: (...args: unknown[]) => FakeStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

type FakeDbHandlers = {
  first?: (statement: FakeStatement) => unknown;
  all?: (statement: FakeStatement) => unknown[];
  run?: (statement: FakeStatement) => { meta: { changes: number } };
};

function createDraft(items: ListingDraft["items"]): ListingDraft {
  return {
    postType: "offer",
    title: "Kitchen bundle",
    description: "Small apartment kitchen starter set.",
    price: 95,
    category: "Home",
    condition: "good",
    location: "Local pickup",
    items,
    images: [
      {
        id: "image-1",
        name: "kitchen.png",
        dataUrl: "data:image/png;base64,a2l0Y2hlbg==",
        primary: false,
        createdAt: "2026-05-23T10:00:00.000Z"
      }
    ]
  };
}

function createEnv(handlers: FakeDbHandlers = {}) {
  const statements: FakeStatement[] = [];
  const batch = vi.fn(async () => []);
  const db = {
    prepare(sql: string) {
      const statement: FakeStatement = {
        sql,
        args: [],
        bind(...args: unknown[]) {
          statement.args = args;
          return statement;
        },
        async first() {
          const result = handlers.first?.(statement);
          if (result !== undefined) return result;
          if (sql.includes("FROM users")) {
            return {
              id: "seller-1",
              role: "seller",
              pickup_area: "Brooklyn",
              pickup_zip: "11201",
              service_area_miles: 10,
              pickup_policy: "Brooklyn pickup.",
              handoff_policy: "Confirm before meetup.",
              cancellation_policy: "Cancel early when plans change.",
              off_platform_instructions: "Coordinate in chat.",
              response_expectation: "Replies within one day.",
              seller_activated_at: "2026-05-23T10:00:00.000Z"
            };
          }
          return null;
        },
        async all() {
          return { results: handlers.all?.(statement) ?? [] };
        },
        async run() {
          return handlers.run?.(statement) ?? { meta: { changes: 1 } };
        }
      };
      statements.push(statement);
      return statement;
    },
    batch
  };

  return {
    env: { DB: db as unknown as D1Database } as Env,
    statements,
    batch
  };
}

function createReservationRow(status = "requested") {
  return {
    id: "reservation-1",
    listing_id: "listing-1",
    buyer_id: "buyer-1",
    seller_id: "seller-1",
    status,
    payment_due_at: "2026-05-22T10:00:00.000Z",
    overdue_notified_at: null,
    created_at: "2026-05-22T10:00:00.000Z",
    updated_at: "2026-05-22T10:00:00.000Z"
  };
}

describe("Cloudflare listing persistence", () => {
  it("persists every item in a multi-item listing", async () => {
    const { env, statements, batch } = createEnv();

    await createListingInDb(
      env,
      "seller-1",
      createDraft([
        {
          id: "item-1",
          name: "Saucepan",
          price: 35,
          condition: "good",
          notes: "Stainless steel",
          position: 0,
          createdAt: "2026-05-23T10:00:00.000Z"
        },
        {
          id: "item-2",
          name: "Knife block",
          price: 60,
          condition: "like_new",
          notes: "Five knives",
          position: 1,
          createdAt: "2026-05-23T10:00:00.000Z"
        }
      ])
    );

    const itemStatements = statements.filter((statement) => statement.sql.includes("INSERT INTO listing_items"));
    const listingStatement = statements.find((statement) => statement.sql.includes("INSERT INTO listings"));
    expect(batch).toHaveBeenCalledTimes(1);
    expect(listingStatement?.args.slice(5, 8)).toEqual([95, "Home", "good"]);
    expect(itemStatements).toHaveLength(2);
    expect(itemStatements[0].args.slice(2, 7)).toEqual(["Saucepan", 35, "good", "Stainless steel", 0]);
    expect(itemStatements[1].args.slice(2, 7)).toEqual(["Knife block", 60, "like_new", "Five knives", 1]);
  });

  it("rejects missing, partial, and oversized item sets", async () => {
    const partial = createEnv();
    const blank = createEnv();
    const missingPrice = createEnv();
    const noItems = createEnv();
    const tooMany = createEnv();

    await expect(
      createListingInDb(
        partial.env,
        "seller-1",
        createDraft([
          {
            id: "item-partial",
            name: "",
            price: 25,
            condition: "good",
            position: 0,
            createdAt: "2026-05-23T10:00:00.000Z"
          }
        ])
      )
    ).rejects.toThrow("Every listing item must include a name.");
    await expect(
      createListingInDb(
        blank.env,
        "seller-1",
        createDraft([
          {
            id: "item-blank",
            name: "",
            position: 0,
            createdAt: "2026-05-23T10:00:00.000Z"
          }
        ])
      )
    ).rejects.toThrow("Every listing item must include a name.");
    await expect(
      createListingInDb(
        missingPrice.env,
        "seller-1",
        createDraft([
          {
            id: "item-missing-price",
            name: "Saucepan",
            condition: "good",
            position: 0,
            createdAt: "2026-05-23T10:00:00.000Z"
          }
        ])
      )
    ).rejects.toThrow("Every listing item must include a price.");
    await expect(createListingInDb(noItems.env, "seller-1", createDraft([]))).rejects.toThrow(
      "Listings must include at least one item."
    );
    await expect(
      createListingInDb(
        tooMany.env,
        "seller-1",
        createDraft(
          Array.from({ length: MAX_LISTING_ITEMS + 1 }, (_, index) => ({
            id: `item-${index}`,
            name: `Item ${index + 1}`,
            price: 10 + index,
            condition: "good" as const,
            position: index,
            createdAt: "2026-05-23T10:00:00.000Z"
          }))
        )
      )
    ).rejects.toThrow(`Listings must include no more than ${MAX_LISTING_ITEMS} items.`);
    expect(partial.batch).not.toHaveBeenCalled();
    expect(blank.batch).not.toHaveBeenCalled();
    expect(missingPrice.batch).not.toHaveBeenCalled();
    expect(noItems.batch).not.toHaveBeenCalled();
    expect(tooMany.batch).not.toHaveBeenCalled();
  });

  it("requires seller setup before creating a listing", async () => {
    const blocked = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM users")) return { id: "seller-1", role: "seller" };
        return undefined;
      }
    });

    await expect(
      createListingInDb(
        blocked.env,
        "seller-1",
        createDraft([
          {
            id: "item-1",
            name: "Saucepan",
            price: 35,
            condition: "good",
            notes: "Stainless steel",
            position: 0,
            createdAt: "2026-05-23T10:00:00.000Z"
          }
        ])
      )
    ).rejects.toThrow("Complete seller setup before publishing a listing.");
    expect(blocked.batch).not.toHaveBeenCalled();
  });

  it("allows publishing without response expectation or off-platform instructions", async () => {
    const simplified = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM users")) {
          return {
            id: "seller-1",
            role: "seller",
            pickup_area: "Brooklyn",
            cancellation_policy: "Cancel before the handoff window if plans change.",
            off_platform_instructions: "",
            response_expectation: ""
          };
        }
        return undefined;
      }
    });

    await createListingInDb(
      simplified.env,
      "seller-1",
      createDraft([
        {
          id: "item-1",
          name: "Saucepan",
          price: 35,
          condition: "good",
          notes: "Stainless steel",
          position: 0,
          createdAt: "2026-05-23T10:00:00.000Z"
        }
      ])
    );

    expect(simplified.batch).toHaveBeenCalledTimes(1);
  });
});

describe("Cloudflare reservation workflow", () => {
  it("creates buyer conversations without reserving the listing", async () => {
    const { env, statements, batch } = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM listings")) {
          return {
            id: "listing-1",
            seller_id: "seller-1",
            title: "Mirrorless camera kit",
            status: "available"
          };
        }
        if (statement.sql.includes("SELECT name FROM users")) return { name: "Jordan Lee" };
        return undefined;
      }
    });

    await reserveListingInDb(env.DB, "listing-1", "buyer-1");

    const reservationInsert = statements.find((statement) => statement.sql.includes("INSERT INTO reservations"));
    const notificationInsert = statements.find((statement) => statement.sql.includes("INSERT INTO notifications"));
    const listingLock = statements.find((statement) => statement.sql.includes("UPDATE listings SET status = 'reserved'"));
    expect(batch).toHaveBeenCalledTimes(1);
    expect(reservationInsert?.sql).toContain("'requested'");
    expect(reservationInsert?.args.slice(1, 4)).toEqual(["listing-1", "buyer-1", "seller-1"]);
    expect(notificationInsert?.args[2]).toBe("New buyer interest");
    expect(notificationInsert?.args[3]).toBe("Jordan Lee is interested in Mirrorless camera kit.");
    expect(String(notificationInsert?.args[3]).toLowerCase()).not.toMatch(/payment|paid/);
    expect(listingLock).toBeUndefined();
  });

  it("does not duplicate an active buyer conversation for the same listing", async () => {
    const { env, batch } = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM listings")) {
          return {
            id: "listing-1",
            seller_id: "seller-1",
            title: "Mirrorless camera kit",
            status: "available"
          };
        }
        if (statement.sql.includes("FROM reservations")) return { id: "reservation-existing" };
        return undefined;
      }
    });

    await reserveListingInDb(env.DB, "listing-1", "buyer-1");

    expect(batch).not.toHaveBeenCalled();
  });

  it("only lets sellers complete handoff and rejects payment-status updates", async () => {
    const completed = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM reservations")) return createReservationRow();
        return undefined;
      }
    });
    const buyerAttempt = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM reservations")) return createReservationRow();
        return undefined;
      }
    });
    const paymentAttempt = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM reservations")) return createReservationRow();
        return undefined;
      }
    });

    await updateReservationStatusInDb(completed.env.DB, "reservation-1", "seller-1", "sold");
    await expect(
      updateReservationStatusInDb(buyerAttempt.env.DB, "reservation-1", "buyer-1", "sold")
    ).rejects.toThrow("Only the seller can complete the handoff.");
    await expect(
      updateReservationStatusInDb(paymentAttempt.env.DB, "reservation-1", "buyer-1", "payment_sent")
    ).rejects.toThrow("Buyer conversation status can only be completed or cancelled.");

    const completedBatchCalls = completed.batch.mock.calls as unknown as [FakeStatement[]][];
    const statements = completedBatchCalls[0]?.[0] ?? [];
    const reservationUpdate = statements.find((statement) => statement.sql.includes("UPDATE reservations SET status"));
    const notificationInsert = statements.find((statement) => statement.sql.includes("INSERT INTO notifications"));
    expect(reservationUpdate).toBeDefined();
    expect(notificationInsert).toBeDefined();
    if (!reservationUpdate || !notificationInsert) return;
    expect(reservationUpdate.args[0]).toBe("sold");
    expect(notificationInsert.sql).toContain("Handoff complete");
    expect(notificationInsert.args[2]).toBe("The seller marked your handoff as complete.");
  });

  it("records cancellation reasons without changing listing availability", async () => {
    const cancelled = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM reservations")) return createReservationRow();
        if (statement.sql.includes("SELECT title FROM listings")) return { title: "Mirrorless camera kit" };
        if (statement.sql.includes("SELECT name FROM users")) return { name: "Jordan Lee" };
        return undefined;
      }
    });

    await updateReservationStatusInDb(cancelled.env.DB, "reservation-1", "buyer-1", {
      status: "cancelled",
      reason: "Plans changed",
      note: "Found another option.",
      recoveryAction: "relist"
    });

    const batchCalls = cancelled.batch.mock.calls as unknown as [FakeStatement[]][];
    const statements = batchCalls[0]?.[0] ?? [];
    const reservationUpdate = statements.find((statement) => statement.sql.includes("cancelled_at"));
    const listingUpdate = statements.find((statement) => statement.sql.includes("UPDATE listings SET status"));
    const messageInsert = statements.find((statement) => statement.sql.includes("INSERT INTO messages"));
    const notificationInsert = statements.find((statement) => statement.sql.includes("Conversation cancelled"));

    expect(reservationUpdate?.args.slice(0, 6)).toEqual([
      "cancelled",
      expect.any(String),
      "buyer-1",
      "Plans changed",
      "Found another option.",
      "none"
    ]);
    expect(listingUpdate).toBeUndefined();
    expect(String(messageInsert?.args[3])).toContain("Plans changed");
    expect(notificationInsert?.sql).toContain("'reservation_cancelled'");
  });

  it("updates reservation handoff details and notifies the other participant", async () => {
    const handoff = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM reservations")) return createReservationRow();
        if (statement.sql.includes("SELECT title FROM listings")) return { title: "Mirrorless camera kit" };
        if (statement.sql.includes("SELECT name FROM users")) return { name: "Jordan Lee" };
        return undefined;
      }
    });

    await updateReservationHandoffInDb(handoff.env.DB, "reservation-1", "buyer-1", {
      handoffMethod: "pickup",
      handoffWindow: "Saturday 2-4 PM",
      handoffLocation: "Lobby entrance",
      handoffNote: "Text when nearby.",
      confirmBuyer: true
    });

    const batchCalls = handoff.batch.mock.calls as unknown as [FakeStatement[]][];
    const statements = batchCalls[0]?.[0] ?? [];
    const reservationUpdate = statements.find((statement) => statement.sql.includes("handoff_method"));
    const notificationInsert = statements.find((statement) => statement.sql.includes("Handoff updated"));

    expect(reservationUpdate?.args.slice(0, 5)).toEqual([
      "pickup",
      "Saturday 2-4 PM",
      "Lobby entrance",
      null,
      "Text when nearby."
    ]);
    expect(reservationUpdate?.sql).toContain("status = 'payment_sent'");
    expect(reservationUpdate?.args[5]).toEqual(expect.any(String));
    expect(notificationInsert?.args[1]).toBe("seller-1");
  });

  it("rejects incomplete reservation handoff details", async () => {
    const handoff = createEnv({
      first(statement) {
        if (statement.sql.includes("FROM reservations")) return createReservationRow();
        return undefined;
      }
    });

    await expect(
      updateReservationHandoffInDb(handoff.env.DB, "reservation-1", "buyer-1", {
        handoffMethod: "pickup",
        handoffWindow: "",
        handoffLocation: "Lobby entrance"
      })
    ).rejects.toThrow("Handoff window and pickup or shipping details are required.");
    await expect(
      updateReservationHandoffInDb(handoff.env.DB, "reservation-1", "buyer-1", {
        handoffMethod: "shipping",
        handoffWindow: "Saturday",
        handoffTracking: ""
      })
    ).rejects.toThrow("Handoff window and pickup or shipping details are required.");
    expect(handoff.batch).not.toHaveBeenCalled();
  });

  it("expires stale buyer conversations with follow-up language through the D1 read path", async () => {
    const { env, statements, batch } = createEnv({
      all(statement) {
        if (statement.sql.includes("FROM reservations r")) {
          return [
            {
              ...createReservationRow("requested"),
              title: "Mirrorless camera kit",
              buyer_name: "Jordan Lee"
            }
          ];
        }
        return [];
      }
    });

    await readState(env.DB, { id: "buyer-1" });

    const expirationUpdate = statements.find((statement) =>
      statement.sql.includes("SET status = 'overdue'")
    );
    const expirationBatchCalls = batch.mock.calls as unknown as [FakeStatement[]][];
    const notificationStatements = expirationBatchCalls[0]?.[0] ?? [];
    const notificationBodies = notificationStatements.map((statement) => String(statement.args[2]));

    expect(expirationUpdate?.sql).toContain("status IN ('requested', 'awaiting_payment', 'payment_sent')");
    expect(notificationBodies).toContain("Follow up about Mirrorless camera kit.");
    expect(notificationBodies).toContain("Jordan Lee may need a reply about Mirrorless camera kit.");
    expect(notificationBodies.join(" ").toLowerCase()).not.toMatch(/payment|paid/);
  });
});
