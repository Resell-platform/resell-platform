import { useState } from "react";
import { Package } from "lucide-react";
import { MAX_LISTING_ITEMS, type ListingDraft, type ListingItem } from "../../data/types";
import { statusLabel, type Copy, type Locale } from "../../i18n";
import { useNarrowLayout } from "../../hooks/useNarrowLayout";
import {
  createBlankDraftItem,
  formatOptionalPrice,
  getDraftItemTotal,
  isDraftItemComplete,
  isRequestPost
} from "../../utils/listingHelpers";

export function ListingItemFields({
  draft,
  onChange,
  text,
  locale,
  ariaPrefix
}: {
  draft: ListingDraft;
  onChange: (draft: ListingDraft) => void;
  text: Copy;
  locale: Locale;
  ariaPrefix?: string;
}) {
  const items = Array.isArray(draft.items) ? draft.items : [];
  const canAddItem = items.length < MAX_LISTING_ITEMS;
  const collapseCompletedItems = useNarrowLayout();
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(() => new Set());

  function reindex(nextItems: ListingItem[]) {
    return nextItems.map((item, index) => ({ ...item, position: index }));
  }

  function syncDraftItems(nextItems: ListingItem[]) {
    const reindexedItems = reindex(nextItems);
    return {
      ...draft,
      condition: reindexedItems[0]?.condition ?? draft.condition,
      items: reindexedItems
    };
  }

  function updateItem(itemId: string, patch: Partial<ListingItem>) {
    onChange(syncDraftItems(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))));
  }

  function addItem() {
    if (!canAddItem) return;
    const item = createBlankDraftItem(items.length, draft.condition);
    onChange(syncDraftItems([...items, item]));
  }

  function removeItem(itemId: string) {
    const remaining = items.filter((item) => item.id !== itemId);
    setCollapsedItemIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
    onChange(syncDraftItems(remaining));
  }

  function toggleItem(itemId: string) {
    setCollapsedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  return (
    <section className="item-fields">
      <div className="subsection-header">
        <div>
          <span>{isRequestPost(draft) ? text.wantedItems : text.postItems}</span>
          <p>{isRequestPost(draft) ? text.wantedItemsHelp : text.postItemsHelp}</p>
          <p className="item-total">
            {isRequestPost(draft) ? text.budgetTotal : text.listingTotal}: ${getDraftItemTotal(draft)}
          </p>
        </div>
        <button type="button" className="secondary" onClick={addItem} disabled={!canAddItem}>
          <Package size={16} />
          {text.addItem}
        </button>
      </div>
      {items.map((item, index) => {
        const complete = isDraftItemComplete(item, draft);
        const canCollapseItem = collapseCompletedItems && complete;
        const collapsed = collapseCompletedItems && complete && collapsedItemIds.has(item.id);
        const expanded = !collapsed;
        const fieldsId = `item-fields-${item.id}`;
        const summary = [
          item.name.trim() || `${text.itemSingular} ${index + 1}`,
          formatOptionalPrice(item.price),
          item.condition ? statusLabel(item.condition, locale) : ""
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <div className={expanded ? "item-row" : "item-row collapsed"} key={item.id}>
            <div className="item-row-heading">
              {canCollapseItem ? (
                <button
                  type="button"
                  className="item-summary-button"
                  aria-expanded={expanded}
                  aria-controls={fieldsId}
                  onClick={() => toggleItem(item.id)}
                >
                  <strong>
                    {text.itemSingular} {index + 1}
                  </strong>
                  <span>{summary}</span>
                </button>
              ) : (
                <div className="item-row-title">
                  <strong>
                    {text.itemSingular} {index + 1}
                  </strong>
                  <span>{complete ? summary : text.incompleteItem}</span>
                </div>
              )}
              <button
                type="button"
                className="ghost-inline"
                onClick={() => removeItem(item.id)}
                disabled={items.length <= 1}
              >
                {text.removeItem}
              </button>
            </div>
            <div className="field-grid item-row-fields" id={fieldsId} hidden={!expanded}>
              <label>
                <span>{isRequestPost(draft) ? text.wantedItemName : text.itemName}</span>
                <input
                  aria-label={`${ariaPrefix ? `${ariaPrefix} ` : ""}${
                    isRequestPost(draft) ? text.wantedItemName : text.itemName
                  } ${index + 1}`}
                  value={item.name}
                  onChange={(event) => updateItem(item.id, { name: event.target.value })}
                />
              </label>
              <label>
                <span>{isRequestPost(draft) ? text.targetBudget : text.itemPrice}</span>
                <input
                  aria-label={`${ariaPrefix ? `${ariaPrefix} ` : ""}${
                    isRequestPost(draft) ? text.targetBudget : text.itemPrice
                  } ${index + 1}`}
                  type="number"
                  min={isRequestPost(draft) ? "0" : "1"}
                  value={item.price ?? ""}
                  onChange={(event) =>
                    updateItem(item.id, {
                      price: event.target.value ? Number(event.target.value) : undefined
                    })
                  }
                />
              </label>
              <label>
                <span>{isRequestPost(draft) ? text.desiredCondition : text.itemCondition}</span>
                <select
                  aria-label={`${ariaPrefix ? `${ariaPrefix} ` : ""}${
                    isRequestPost(draft) ? text.desiredCondition : text.itemCondition
                  } ${index + 1}`}
                  value={item.condition ?? ""}
                  onChange={(event) =>
                    updateItem(item.id, {
                      condition: event.target.value
                        ? (event.target.value as ListingDraft["condition"])
                        : undefined
                    })
                  }
                >
                  {isRequestPost(draft) && <option value="">{text.anyCondition}</option>}
                  {["new", "like_new", "good", "fair"].map((condition) => (
                    <option key={condition} value={condition}>
                      {statusLabel(condition, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{isRequestPost(draft) ? text.referenceNotes : text.itemNotes}</span>
                <input
                  aria-label={`${ariaPrefix ? `${ariaPrefix} ` : ""}${
                    isRequestPost(draft) ? text.referenceNotes : text.itemNotes
                  } ${index + 1}`}
                  value={item.notes ?? ""}
                  onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                />
              </label>
            </div>
          </div>
        );
      })}
    </section>
  );
}
