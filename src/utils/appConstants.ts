import type { Reservation } from "../data/types";
import type { BrowseFilters, TextScale } from "../types/app";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const ACTIVE_RESERVATION_STATUSES: Reservation["status"][] = [
  "requested",
  "awaiting_payment",
  "payment_sent",
  "overdue"
];

export const TERMINAL_RESERVATION_STATUSES = new Set<Reservation["status"]>(["paid", "sold", "cancelled"]);

export const DEFAULT_BROWSE_FILTERS: BrowseFilters = {
  category: "all",
  condition: "all",
  status: "available",
  minPrice: "",
  maxPrice: "",
  sort: "newest"
};

export const TEXT_SCALE_STORAGE_KEY = "resell-text-scale";

export const TEXT_SCALES: TextScale[] = ["compact", "default", "large"];
