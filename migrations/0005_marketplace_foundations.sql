ALTER TABLE users ADD COLUMN pickup_zip TEXT;
ALTER TABLE users ADD COLUMN service_area_miles INTEGER;
ALTER TABLE users ADD COLUMN pickup_policy TEXT;
ALTER TABLE users ADD COLUMN handoff_policy TEXT;
ALTER TABLE users ADD COLUMN cancellation_policy TEXT;
ALTER TABLE users ADD COLUMN off_platform_instructions TEXT;
ALTER TABLE users ADD COLUMN response_expectation TEXT;
ALTER TABLE users ADD COLUMN seller_activated_at TEXT;
ALTER TABLE users ADD COLUMN email_notifications_enabled INTEGER NOT NULL DEFAULT 1;

UPDATE users
SET
  pickup_zip = CASE WHEN id = 'seller-1' THEN '11201' ELSE pickup_zip END,
  service_area_miles = CASE WHEN id = 'seller-1' THEN 10 ELSE service_area_miles END,
  pickup_policy = CASE
    WHEN id = 'seller-1' THEN 'Pickup in Brooklyn or nearby meetup by agreement.'
    ELSE pickup_policy
  END,
  handoff_policy = CASE
    WHEN id = 'seller-1' THEN 'Use reservation chat to confirm the handoff window before meeting.'
    ELSE handoff_policy
  END,
  cancellation_policy = CASE
    WHEN id = 'seller-1' THEN 'Please cancel early if timing changes so the listing can reopen.'
    ELSE cancellation_policy
  END,
  off_platform_instructions = CASE
    WHEN id = 'seller-1' THEN 'Agree on handoff details directly in chat.'
    ELSE off_platform_instructions
  END,
  response_expectation = CASE
    WHEN id = 'seller-1' THEN 'Usually replies within one day.'
    ELSE response_expectation
  END,
  seller_activated_at = CASE WHEN id = 'seller-1' THEN COALESCE(updated_at, created_at) ELSE seller_activated_at END
WHERE id = 'seller-1';

ALTER TABLE reservations ADD COLUMN cancelled_at TEXT;
ALTER TABLE reservations ADD COLUMN cancelled_by_user_id TEXT;
ALTER TABLE reservations ADD COLUMN cancellation_reason TEXT;
ALTER TABLE reservations ADD COLUMN cancellation_note TEXT;
ALTER TABLE reservations ADD COLUMN recovery_state TEXT NOT NULL DEFAULT 'none';
ALTER TABLE reservations ADD COLUMN handoff_method TEXT;
ALTER TABLE reservations ADD COLUMN handoff_window TEXT;
ALTER TABLE reservations ADD COLUMN handoff_location TEXT;
ALTER TABLE reservations ADD COLUMN handoff_tracking TEXT;
ALTER TABLE reservations ADD COLUMN handoff_note TEXT;
ALTER TABLE reservations ADD COLUMN buyer_confirmed_at TEXT;
ALTER TABLE reservations ADD COLUMN seller_confirmed_at TEXT;

ALTER TABLE notifications ADD COLUMN dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
