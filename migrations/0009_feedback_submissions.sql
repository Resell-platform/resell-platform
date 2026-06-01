CREATE TABLE IF NOT EXISTS feedback_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  contact_email TEXT,
  category TEXT NOT NULL CHECK (category IN ('bug', 'suggestion', 'listing', 'handoff', 'safety', 'trust')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'blocking', 'safety')),
  summary TEXT NOT NULL,
  details TEXT NOT NULL,
  source_view TEXT NOT NULL,
  entity_type TEXT CHECK (entity_type IN ('listing', 'reservation')),
  entity_id TEXT,
  page_url TEXT,
  locale TEXT,
  data_source TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'processing', 'issue_created', 'triage_failed', 'duplicate', 'needs_more_info')),
  triage_summary TEXT,
  triage_labels TEXT,
  github_issue_number INTEGER,
  github_issue_url TEXT,
  github_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  triaged_at TEXT
);

CREATE INDEX IF NOT EXISTS feedback_submissions_status_created_idx
  ON feedback_submissions(status, created_at);

CREATE INDEX IF NOT EXISTS feedback_submissions_user_idx
  ON feedback_submissions(user_id);

CREATE INDEX IF NOT EXISTS feedback_submissions_ip_created_idx
  ON feedback_submissions(ip_hash, created_at);
