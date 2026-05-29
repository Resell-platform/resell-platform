PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS listing_items (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price REAL CHECK (price IS NULL OR price > 0),
  condition TEXT CHECK (condition IS NULL OR condition IN ('new', 'like_new', 'good', 'fair')),
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO listing_items (
  id, listing_id, name, price, condition, notes, position, created_at
)
SELECT
  listings.id || '-item-1',
  listings.id,
  listings.title,
  listings.price,
  listings.condition,
  listings.description,
  0,
  listings.created_at
FROM listings
WHERE NOT EXISTS (
  SELECT 1
  FROM listing_items
  WHERE listing_items.listing_id = listings.id
);

CREATE INDEX IF NOT EXISTS idx_listing_items_listing_id_position
  ON listing_items(listing_id, position);
