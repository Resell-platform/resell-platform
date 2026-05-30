---
name: resell-frontend-ux
description: Use when modifying this repo's frontend UX, including listing creation, account panel behavior, collapsible sidebar, mobile navigation, wording conventions, and mobile/laptop verification expectations.
---

# Resell Frontend UX

Frontend changes should keep the app operational and marketplace-focused. Do not add marketing/landing-page chrome when the user asks for app functionality.

## Project Conventions

- Use transactional marketplace language: `listing`, `included items`, `reserve listing`.
- Avoid social `post` wording in seller/buyer workflows.
- Do not duplicate creation flows. Sellers create one listing with at least one included item.
- Logged-in account UI should be compact by default; profile editing is opened intentionally.
- Desktop sidebar is collapsible into an icon rail.
- Mobile navigation can be hidden and shown from the mobile header.
- Keep mobile and laptop behavior equivalent unless the user asks for platform-specific behavior.

## Listing Creation UX

- Listing-level fields: images, listing title, category, pickup/shipping notes, listing description.
- Item-level fields: item name, item price, item condition, item notes.
- Publish/save remains disabled until the listing has at least one valid item and required listing fields.
- The last item row should not be removable.
- Show listing total derived from item prices.
- Single-item listings still show `1 item` and the included item section.

## Verification

Run:

```bash
rtk npm run test
rtk npm run typecheck
rtk npm run build
```

For UI work, also smoke locally:

```bash
rtk npm run dev -- --host 127.0.0.1 --port 5173
rtk curl -sS -I http://127.0.0.1:5173/
```

When browser automation is available, verify both desktop and mobile-sized views. If the in-app browser backend is unavailable, say so and report the alternate checks used.

