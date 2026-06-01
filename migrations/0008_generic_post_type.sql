ALTER TABLE listings ADD COLUMN post_type TEXT NOT NULL DEFAULT 'offer'
  CHECK (post_type IN ('offer', 'request'));

UPDATE listings
SET post_type = 'offer'
WHERE post_type IS NULL OR post_type = '';
