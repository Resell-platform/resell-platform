import { createId, getUserName } from "../data/store";
import {
  MAX_LISTING_ITEMS,
  type AppState,
  type Listing,
  type ListingDraft,
  type ListingItem,
  type ListingPostType,
  type Reservation
} from "../data/types";
import type { Copy } from "../i18n";
import type { BrowseFilters, BrowseListingViewModel } from "../types/app";
import { DEFAULT_BROWSE_FILTERS } from "./appConstants";

export function createBlankDraftItem(
  position: number,
  condition: ListingItem["condition"] = "good"
): ListingItem {
  return {
    id: createId("item"),
    name: "",
    condition,
    position,
    createdAt: new Date().toISOString()
  };
}

export function createBlankDraft(postType: ListingPostType = "offer"): ListingDraft {
  return {
    postType,
    title: "",
    description: "",
    price: 0,
    category: "Furniture",
    condition: "good",
    location: "",
    images: [],
    items: [createBlankDraftItem(0)]
  };
}

export function listingToDraft(listing: Listing): ListingDraft {
  return {
    postType: listing.postType,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    category: listing.category,
    condition: listing.condition,
    location: listing.location,
    images: listing.images.map((image, index) => ({
      ...image,
      primary: index === 0
    })),
    items:
      listing.items.length > 0
        ? listing.items.map((item, index) => ({
            ...item,
            condition: item.condition ?? listing.condition,
            position: index
          }))
        : [createBlankDraftItem(0, listing.condition)]
  };
}

export function getItemCountText(listing: Listing, text: Copy): string {
  const count = listing.items.length;
  return `${count} ${count === 1 ? text.itemSingular : text.itemPlural}`;
}

export function isRequestPost(post: Pick<Listing | ListingDraft, "postType">): boolean {
  return post.postType === "request";
}

export function getListingPriceText(listing: Listing, text: Copy): string {
  if (!isRequestPost(listing)) return `$${listing.price}`;
  return listing.price > 0 ? `${text.budget}: $${listing.price}` : text.openBudget;
}

export function getListingMetaParts(listing: Listing, text: Copy): string[] {
  return [
    getListingPriceText(listing, text),
    getItemCountText(listing, text),
    `${text.updated} ${new Date(listing.updatedAt).toLocaleDateString()}`
  ].filter(Boolean);
}

export function getParticipantSummary(
  listing: Listing,
  reservation: Reservation,
  state: AppState,
  text: Copy
): string[] {
  return [
    `${getUserName(state, reservation.buyerId)} ${text.participantAnd} ${getUserName(state, reservation.sellerId)}`,
    getItemCountText(listing, text)
  ].filter(Boolean);
}

export function formatOptionalPrice(price?: number): string {
  return Number.isFinite(price) ? `$${price}` : "";
}

export function getDraftItemTotal(draft: ListingDraft): number {
  return (Array.isArray(draft.items) ? draft.items : []).reduce(
    (total, item) => total + (Number.isFinite(item.price) ? Number(item.price) : 0),
    0
  );
}

export function getListingDisplayItems(listing: Listing): ListingItem[] {
  return listing.items.slice().sort((first, second) => first.position - second.position);
}

export function getListingSearchFields(listing: Listing): string[] {
  return [
    listing.title,
    listing.category,
    listing.description,
    listing.location,
    ...listing.items.flatMap((item) => [item.name, item.notes ?? ""])
  ].map((field) => field.toLowerCase());
}

export function createBrowseListingViewModel(listing: Listing): BrowseListingViewModel {
  const displayItems = getListingDisplayItems(listing);

  return {
    listing,
    displayItems,
    itemSummary: displayItems.slice(0, 3),
    searchFields: getListingSearchFields(listing),
    updatedAtMs: new Date(listing.updatedAt).getTime()
  };
}

export function getActiveBrowseFilterCount(filters: BrowseFilters): number {
  return [
    filters.category !== DEFAULT_BROWSE_FILTERS.category,
    filters.condition !== DEFAULT_BROWSE_FILTERS.condition,
    filters.status !== DEFAULT_BROWSE_FILTERS.status,
    filters.minPrice.trim() !== "",
    filters.maxPrice.trim() !== "",
    filters.sort !== DEFAULT_BROWSE_FILTERS.sort
  ].filter(Boolean).length;
}

export function isDraftItemComplete(item: ListingItem, draft: ListingDraft): boolean {
  if (isRequestPost(draft)) return Boolean(item.name.trim());
  return Boolean(
    item.name.trim() &&
      Number.isFinite(item.price) &&
      Number(item.price) > 0 &&
      item.condition
  );
}

export function hasPublishableItems(draft: ListingDraft): boolean {
  const items = Array.isArray(draft.items) ? draft.items : [];
  const isRequest = isRequestPost(draft);

  return (
    items.length > 0 &&
    items.length <= MAX_LISTING_ITEMS &&
    items.every(
      (item) =>
        item.name.trim() &&
        (isRequest || (Number.isFinite(item.price) && Number(item.price) > 0)) &&
        (isRequest || item.condition)
    )
  );
}
