import type { Listing, ListingItem, Reservation } from "../data/types";
import type { HandoffPlanDraft } from "../data/store";

export type View = "browse" | "sell" | "orders" | "chat" | "notifications";

export type BrowseSort = "newest" | "price_asc" | "price_desc" | "title";

export type TextScale = "compact" | "default" | "large";

export type BrowseFilters = {
  category: string;
  condition: string;
  status: string;
  minPrice: string;
  maxPrice: string;
  sort: BrowseSort;
};

export type BrowseListingViewModel = {
  listing: Listing;
  displayItems: ListingItem[];
  itemSummary: ListingItem[];
  searchFields: string[];
  updatedAtMs: number;
};

export type ReservationCoordination = Reservation & {
  handoffPlan?: HandoffPlanDraft & {
    updatedAt?: string;
    updatedById?: string;
  };
  cancelledById?: string;
};
