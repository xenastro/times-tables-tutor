-- Parents own learners. Children never have passwords: their phones are linked with a code.

CREATE TABLE parents (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  parent_id  TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_parent ON sessions(parent_id);

CREATE TABLE learners (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  birth_year    INTEGER,
  avatar        TEXT NOT NULL,
  theme         TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL
);
CREATE INDEX learners_parent ON learners(parent_id);

CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  learner_id   TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  label        TEXT,
  paired_at    INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX devices_learner ON devices(learner_id);

CREATE TABLE pairing_codes (
  code       TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- Failed login / pairing attempts, for simple rate limiting.
CREATE TABLE failures (
  bucket TEXT NOT NULL,
  ts     INTEGER NOT NULL
);
CREATE INDEX failures_bucket ON failures(bucket, ts);

-- Append-only practice log. `id` is generated on the phone, so re-sending is harmless.
CREATE TABLE events (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  id           TEXT NOT NULL UNIQUE,
  learner_id   TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  device_id    TEXT,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  client_ts    INTEGER NOT NULL,
  server_ts    INTEGER NOT NULL
);
CREATE INDEX events_learner_seq ON events(learner_id, seq);
