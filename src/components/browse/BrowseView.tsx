import { useEffect, useState } from "react";
import { ChevronLeft, Filter, Search, Share2, ShoppingBag, X } from "lucide-react";
import type { Listing } from "../../data/types";
import { categoryLabel, statusLabel, type Copy, type Locale } from "../../i18n";
import { useNarrowLayout } from "../../hooks/useNarrowLayout";
import type { BrowseFilters, BrowseListingViewModel, BrowseSort } from "../../types/app";
import { DEFAULT_BROWSE_FILTERS } from "../../utils/appConstants";
import {
  getActiveBrowseFilterCount,
  getItemCountText,
  getListingPriceText,
  isRequestPost
} from "../../utils/listingHelpers";
import { ListingDetailItems } from "./ListingDetailItems";
import { ListingGallery } from "./ListingGallery";
import { ListingImagePreview } from "./ListingImagePreview";

export function BrowseView({
  listings,
  selectedListing,
  activeUserId,
  query,
  setQuery,
  filters,
  setFilters,
  categories,
  selectListing,
  reserveListing,
  shareListing,
  text,
  locale
}: {
  listings: BrowseListingViewModel[];
  selectedListing: BrowseListingViewModel | null;
  activeUserId: string;
  query: string;
  setQuery: (query: string) => void;
  filters: BrowseFilters;
  setFilters: (filters: BrowseFilters) => void;
  categories: string[];
  selectListing: (id: string) => void;
  reserveListing: (id: string) => void;
  shareListing: (listing: Listing) => void;
  text: Copy;
  locale: Locale;
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const isNarrowLayout = useNarrowLayout();
  const activeFilterCount = getActiveBrowseFilterCount(filters);
  const selectedListingRecord = selectedListing?.listing ?? null;
  const selectedDisplayItems = selectedListing?.displayItems ?? [];
  const filterToggleLabel =
    activeFilterCount > 0
      ? `${text.showFilters} (${activeFilterCount} ${text.activeFilters})`
      : text.showFilters;
  const showFeed = !isNarrowLayout || !mobileDetailOpen;
  const showDetail = Boolean(selectedListingRecord) && (!isNarrowLayout || mobileDetailOpen);

  useEffect(() => {
    if (!isNarrowLayout) {
      setMobileDetailOpen(false);
    }
  }, [isNarrowLayout]);

  return (
    <section
      className={
        mobileDetailOpen ? "workspace two-column browse-workspace mobile-detail-open" : "workspace two-column browse-workspace"
      }
    >
      {showFeed && (
        <div className="panel feed">
          <div className="section-header">
            <div>
              <p className="eyebrow">{text.marketplace}</p>
              <h1>{text.browseHeading}</h1>
            </div>
            <label className="search">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={text.searchListings}
              />
            </label>
          </div>
          <div className="filter-toolbar">
            <button
              type="button"
              className="secondary filter-toggle"
              aria-expanded={filtersExpanded}
              aria-controls="browse-filter-controls"
              onClick={() => setFiltersExpanded((expanded) => !expanded)}
            >
              <Filter size={16} />
              {filtersExpanded ? text.hideFilters : filterToggleLabel}
            </button>
            {!filtersExpanded && activeFilterCount > 0 && (
              <button type="button" className="ghost-inline compact-clear" onClick={() => setFilters(DEFAULT_BROWSE_FILTERS)}>
                <X size={16} />
                {text.clearFilters}
              </button>
            )}
          </div>
          <div
            id="browse-filter-controls"
            className={filtersExpanded ? "browse-filters expanded" : "browse-filters"}
            aria-label={text.browseFilters}
            hidden={!filtersExpanded}
          >
            <Filter className="filter-icon" size={18} />
            <label>
              <span>{text.category}</span>
              <select
                value={filters.category}
                onChange={(event) => setFilters({ ...filters, category: event.target.value })}
              >
                <option value="all">{text.allCategories}</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{text.condition}</span>
              <select
                value={filters.condition}
                onChange={(event) => setFilters({ ...filters, condition: event.target.value })}
              >
                <option value="all">{text.allConditions}</option>
                {["new", "like_new", "good", "fair"].map((condition) => (
                  <option key={condition} value={condition}>
                    {statusLabel(condition, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{text.status}</span>
              <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                <option value="all">{text.allStatuses}</option>
                {["available", "reserved", "paused", "sold"].map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{text.minPrice}</span>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={filters.minPrice}
                onChange={(event) => setFilters({ ...filters, minPrice: event.target.value })}
              />
            </label>
            <label>
              <span>{text.maxPrice}</span>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={filters.maxPrice}
                onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value })}
              />
            </label>
            <label>
              <span>{text.sortBy}</span>
              <select
                value={filters.sort}
                onChange={(event) => setFilters({ ...filters, sort: event.target.value as BrowseSort })}
              >
                <option value="newest">{text.sortNewest}</option>
                <option value="price_asc">{text.sortPriceLow}</option>
                <option value="price_desc">{text.sortPriceHigh}</option>
                <option value="title">{text.sortTitle}</option>
              </select>
            </label>
            <button type="button" className="secondary" onClick={() => setFilters(DEFAULT_BROWSE_FILTERS)}>
              <X size={16} />
              {text.clearFilters}
            </button>
          </div>
          <div className="listing-grid">
            {listings.length === 0 && <p className="empty-state">{text.noFilteredListings}</p>}
            {listings.map(({ listing, itemSummary }) => {
              return (
                <button
                  key={listing.id}
                  className={selectedListingRecord?.id === listing.id ? "listing-card selected" : "listing-card"}
                  onClick={() => {
                    selectListing(listing.id);
                    if (isNarrowLayout) {
                      setMobileDetailOpen(true);
                    }
                  }}
                >
                  <ListingImagePreview listing={listing} />
                  <div>
                    <span className={`badge ${listing.status}`}>{statusLabel(listing.status, locale)}</span>
                    <span className={isRequestPost(listing) ? "post-type-badge request" : "post-type-badge offer"}>
                      {isRequestPost(listing) ? text.requestPost : text.offerPost}
                    </span>
                    <h2>{listing.title}</h2>
                    <p>{getListingPriceText(listing, text)}</p>
                    {itemSummary.length > 0 && (
                      <>
                        <span className="item-count">{getItemCountText(listing, text)}</span>
                        <ul className="item-summary">
                          {itemSummary.map((item) => (
                            <li key={item.id}>{item.name}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showDetail && selectedListingRecord && (
        <article className="panel detail">
          {isNarrowLayout && (
            <button type="button" className="secondary mobile-detail-back" onClick={() => setMobileDetailOpen(false)}>
              <ChevronLeft size={18} />
              {text.backToListings}
            </button>
          )}
          <ListingGallery listing={selectedListingRecord} />
          <div className="detail-copy">
            <span className={`badge ${selectedListingRecord.status}`}>{statusLabel(selectedListingRecord.status, locale)}</span>
            <span className={isRequestPost(selectedListingRecord) ? "post-type-badge request" : "post-type-badge offer"}>
              {isRequestPost(selectedListingRecord) ? text.requestPost : text.offerPost}
            </span>
            <h2>{selectedListingRecord.title}</h2>
            <p className="price">{getListingPriceText(selectedListingRecord, text)}</p>
            <p>{selectedListingRecord.description}</p>
            {selectedDisplayItems.length > 0 && (
              <ListingDetailItems listing={selectedListingRecord} items={selectedDisplayItems} text={text} locale={locale} />
            )}
            <dl>
              <div>
                <dt>{text.category}</dt>
                <dd>{categoryLabel(selectedListingRecord.category, locale)}</dd>
              </div>
              <div>
                <dt>{text.location}</dt>
                <dd>{selectedListingRecord.location}</dd>
              </div>
            </dl>
            <button
              className="primary sticky-cta"
              disabled={
                (selectedListingRecord.status !== "available" && selectedListingRecord.status !== "reserved") ||
                selectedListingRecord.sellerId === activeUserId
              }
              onClick={() => reserveListing(selectedListingRecord.id)}
            >
              <ShoppingBag size={18} />
              {selectedListingRecord.sellerId === activeUserId
                ? text.yourPost
                : isRequestPost(selectedListingRecord)
                  ? text.respondToRequest
                  : text.reserveItem}
            </button>
            <button className="secondary sticky-cta" onClick={() => shareListing(selectedListingRecord)}>
              <Share2 size={18} />
              {text.share}
            </button>
          </div>
        </article>
      )}
    </section>
  );
}
