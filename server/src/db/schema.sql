-- BedLink SQLite schema. All timestamps are ISO-8601 UTC strings.

CREATE TABLE IF NOT EXISTS hospitals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  is_govt INTEGER NOT NULL DEFAULT 0,
  schemes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hospital_capabilities (
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  capability TEXT NOT NULL,
  PRIMARY KEY (hospital_id, capability)
);

CREATE TABLE IF NOT EXISTS bed_status (
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  bed_type TEXT NOT NULL,
  free_reported INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (hospital_id, bed_type)
);

-- Append-only audit trail of every bed count change, from any source.
CREATE TABLE IF NOT EXISTS bed_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id TEXT NOT NULL,
  bed_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_free INTEGER,
  next_free INTEGER,
  source TEXT NOT NULL,
  actor TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bed_events_hospital ON bed_events (hospital_id, bed_type, created_at);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  condition TEXT NOT NULL,
  bed_type TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  hospital_id TEXT NOT NULL,
  bed_type TEXT NOT NULL,
  rank INTEGER NOT NULL,
  status TEXT NOT NULL,
  eta_minutes REAL,
  sent_at TEXT NOT NULL,
  responds_by TEXT NOT NULL,
  responded_at TEXT,
  reject_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_offers_request ON offers (request_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers (status, responds_by);

CREATE TABLE IF NOT EXISTS holds (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  offer_id TEXT REFERENCES offers(id),
  hospital_id TEXT NOT NULL,
  bed_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  released_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_holds_request ON holds (request_id);
CREATE INDEX IF NOT EXISTS idx_holds_active_lookup ON holds (hospital_id, bed_type, status);

CREATE TABLE IF NOT EXISTS hospital_tokens (
  token TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  role TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS specialist_on_call (
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  capability TEXT NOT NULL,
  is_on INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (hospital_id, capability)
);

CREATE TABLE IF NOT EXISTS telegram_links (
  chat_id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  token TEXT NOT NULL,
  linked_at TEXT NOT NULL
);
