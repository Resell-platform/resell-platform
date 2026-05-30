---
name: resell-data-model
description: Use when changing or discussing the core marketplace data model in this repo, especially Listing versus ListingItem, reservations, posts, purchases, and future item-level checkout.
---

# Resell Data Model

Current product rule:

- `Listing` is the sellable and reservable object.
- `ListingItem` is included content inside a listing.
- Buyers reserve whole listings today.
- Chat, reservation holds, handoff completion, notifications, and reservations are listing-level.

Avoid user-facing “post” language for transactional flows. Prefer:

- `listing`
- `included items`
- `reserve listing`
- `my listings`

## Current Invariants

- New listings must include at least one explicit item.
- Item name, item price, and item condition are required for new creates/updates.
- Listing total price is derived from item prices.
- Listing summary condition is derived from item conditions.
- Existing read paths may normalize legacy records that lack item rows.

Relevant areas:

- `src/data/types.ts`
- `src/data/store.ts`
- `functions/_shared/db.ts`
- `migrations/0004_listing_items.sql`
- `src/App.tsx`

## Reservation Boundary

Do not make buyers create listings to purchase. Sellers create listings; buyers reserve existing listings.

Do not implement partial item purchase by only changing UI copy. Item-level reservation requires a schema and workflow rewrite:

- item-level status or quantity
- reservation line items
- stable item IDs, no delete/reinsert updates for reserved items
- updated locking rules
- updated chat/reservation/handoff context
- backfill existing listing-level reservations as reserving all items

Until that rewrite exists, the buyer CTA reserves the whole listing and all included items.
