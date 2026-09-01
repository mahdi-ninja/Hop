CREATE TABLE links (
  slug         TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  title        TEXT,
  visit_count  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,          -- UTC ms
  created_by   TEXT,
  updated_at   INTEGER NOT NULL,
  updated_by   TEXT
);
CREATE INDEX idx_links_created_at ON links(created_at DESC);

CREATE TABLE visits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL REFERENCES links(slug) ON DELETE CASCADE,
  ts            INTEGER NOT NULL,         -- UTC ms
  country       TEXT,
  region        TEXT,
  city          TEXT,
  referrer_host TEXT,
  device        TEXT,                     -- desktop | mobile | tablet | other
  browser       TEXT,
  os            TEXT,
  is_bot        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_visits_slug_ts ON visits(slug, ts);
CREATE INDEX idx_visits_ts ON visits(ts);
