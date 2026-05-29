import { describe, expect, it, vi } from "vitest";
import { createListingInDb, type Env } from "./db";
import { MAX_LISTING_ITEMS, type ListingDraft } from "../../src/data/types";

type FakeStatement = {
  sql: string;
  args: unknown[];
  bind: (...args: unknown[]) => FakeStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

function createDraft(items: ListingDraft["items"]): ListingDraft {
  return {
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

function createEnv() {
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
          if (sql.includes("FROM users")) return { id: "seller-1", role: "seller" };
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { meta: { changes: 1 } };
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

describe("Cloudflare listing persistence", () => {
  it("persists every item in a multi-item post", async () => {
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
    expect(batch).toHaveBeenCalledTimes(1);
    expect(itemStatements).toHaveLength(2);
    expect(itemStatements[0].args.slice(2, 7)).toEqual(["Saucepan", 35, "good", "Stainless steel", 0]);
    expect(itemStatements[1].args.slice(2, 7)).toEqual(["Knife block", 60, "like_new", "Five knives", 1]);
  });

  it("rejects partial item rows and posts over the item limit", async () => {
    const partial = createEnv();
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
            position: 0,
            createdAt: "2026-05-23T10:00:00.000Z"
          }
        ])
      )
    ).rejects.toThrow("Every post item with details must include a name.");
    await expect(
      createListingInDb(
        tooMany.env,
        "seller-1",
        createDraft(
          Array.from({ length: MAX_LISTING_ITEMS + 1 }, (_, index) => ({
            id: `item-${index}`,
            name: `Item ${index + 1}`,
            price: 10 + index,
            position: index,
            createdAt: "2026-05-23T10:00:00.000Z"
          }))
        )
      )
    ).rejects.toThrow(`Posts must include no more than ${MAX_LISTING_ITEMS} items.`);
    expect(partial.batch).not.toHaveBeenCalled();
    expect(tooMany.batch).not.toHaveBeenCalled();
  });
});
