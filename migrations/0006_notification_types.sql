PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS notifications_next (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (
    type IN (
      'reservation_created',
      'reservation_cancelled',
      'handoff_planned',
      'message_received',
      'payment_due',
      'payment_overdue',
      'payment_paid'
    )
  ),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_id TEXT,
  read_at TEXT,
  dedupe_key TEXT,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO notifications_next (
  id,
  user_id,
  type,
  title,
  body,
  entity_id,
  read_at,
  dedupe_key,
  created_at
)
SELECT
  id,
  user_id,
  type,
  title,
  body,
  entity_id,
  read_at,
  dedupe_key,
  created_at
FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_next RENAME TO notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at
  ON notifications(user_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

PRAGMA foreign_keys = ON;
