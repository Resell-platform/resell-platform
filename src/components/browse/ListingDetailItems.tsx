import { useEffect, useState } from "react";
import type { Listing, ListingItem } from "../../data/types";
import { statusLabel, type Copy, type Locale } from "../../i18n";
import { useNarrowLayout } from "../../hooks/useNarrowLayout";
import { formatOptionalPrice, getItemCountText } from "../../utils/listingHelpers";

export function ListingDetailItems({
  listing,
  items,
  text,
  locale
}: {
  listing: Listing;
  items: ListingItem[];
  text: Copy;
  locale: Locale;
}) {
  const collapseItems = useNarrowLayout();
  const [showAll, setShowAll] = useState(false);
  const visibleItems = collapseItems && !showAll ? items.slice(0, 3) : items;
  const hasHiddenItems = collapseItems && items.length > 3;
  const itemsId = `detail-items-${listing.id}`;

  useEffect(() => {
    setShowAll(false);
  }, [listing.id]);

  return (
    <section className="detail-items">
      <div className="subsection-header">
        <div>
          <span>{text.postItems}</span>
          <p>{getItemCountText(listing, text)}</p>
        </div>
      </div>
      <div id={itemsId} className="detail-item-list">
        {visibleItems.map((item) => (
          <article className="detail-item" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              {item.notes && <p>{item.notes}</p>}
            </div>
            <div className="detail-item-meta">
              {formatOptionalPrice(item.price) && <span>{formatOptionalPrice(item.price)}</span>}
              {item.condition && <span>{statusLabel(item.condition, locale)}</span>}
            </div>
          </article>
        ))}
      </div>
      {hasHiddenItems && (
        <button
          type="button"
          className="ghost-inline item-list-toggle"
          aria-expanded={showAll}
          aria-controls={itemsId}
          onClick={() => setShowAll((expanded) => !expanded)}
        >
          {showAll ? text.showFewerItems : text.showAllItems}
        </button>
      )}
    </section>
  );
}
