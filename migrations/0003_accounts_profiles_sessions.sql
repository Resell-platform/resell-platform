ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_normalized TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN phone_e164 TEXT;
ALTER TABLE users ADD COLUMN phone_verified_at TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN pickup_area TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;

UPDATE users
SET
  email = CASE
    WHEN id = 'seller-1' THEN 'avery@example.com'
    WHEN id = 'buyer-1' THEN 'jordan@example.com'
    WHEN id = 'buyer-2' THEN 'mina@example.com'
    ELSE email
  END,
  email_normalized = CASE
    WHEN id = 'seller-1' THEN 'avery@example.com'
    WHEN id = 'buyer-1' THEN 'jordan@example.com'
    WHEN id = 'buyer-2' THEN 'mina@example.com'
    ELSE email_normalized
  END,
  email_verified_at = COALESCE(email_verified_at, created_at),
  pickup_area = CASE
    WHEN id = 'seller-1' THEN 'Brooklyn, NY'
    WHEN id = 'buyer-1' THEN 'Queens, NY'
    WHEN id = 'buyer-2' THEN 'New York, NY'
    ELSE pickup_area
  END,
  bio = CASE
    WHEN id = 'seller-1' THEN 'Curates furniture, electronics, and home finds around New York.'
    ELSE COALESCE(bio, '')
  END,
  updated_at = COALESCE(updated_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized
  ON users(email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_e164
  ON users(phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL,
  display_name TEXT,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_email_created
  ON auth_challenges(email_normalized, created_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
  ON auth_sessions(user_id);

