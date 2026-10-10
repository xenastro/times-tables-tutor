-- Children can start on their own: a learner's parent becomes optional, and is connected later.

-- SQLite can't drop NOT NULL, so `learners` is rebuilt. Dropping it would cascade-delete the
-- phones and practice of every child (D1 always enforces foreign keys), so both are copied
-- aside first and put back afterwards. Pairing codes last 15 minutes and are simply dropped.
CREATE TABLE devices_keep AS SELECT * FROM devices;
CREATE TABLE events_keep AS SELECT * FROM events;

CREATE TABLE learners_new (
  id             TEXT PRIMARY KEY,
  parent_id      TEXT REFERENCES parents(id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL DEFAULT '',
  birth_year     INTEGER,
  avatar         TEXT NOT NULL,
  theme          TEXT NOT NULL,
  settings_json  TEXT NOT NULL DEFAULT '{}',
  created_at     INTEGER NOT NULL,
  -- Last practice uploaded; children without a parent are removed after a long silence.
  last_active_at INTEGER
);
INSERT INTO learners_new (id, parent_id, display_name, birth_year, avatar, theme, settings_json, created_at, last_active_at)
  SELECT l.id, l.parent_id, l.display_name, l.birth_year, l.avatar, l.theme, l.settings_json, l.created_at,
         (SELECT MAX(e.server_ts) FROM events e WHERE e.learner_id = l.id)
  FROM learners l;

PRAGMA defer_foreign_keys = on;
DROP TABLE learners;
ALTER TABLE learners_new RENAME TO learners;
CREATE INDEX learners_parent ON learners(parent_id);
CREATE INDEX learners_unclaimed ON learners(last_active_at) WHERE parent_id IS NULL;

INSERT OR IGNORE INTO devices SELECT * FROM devices_keep;
INSERT OR IGNORE INTO events SELECT * FROM events_keep;
DROP TABLE devices_keep;
DROP TABLE events_keep;

-- 'parent': made in the parent area to link a phone. 'child': shown on a child's phone, to
-- move to another phone or to connect a grown-up.
ALTER TABLE pairing_codes ADD COLUMN kind TEXT NOT NULL DEFAULT 'parent';

-- A parent signed in on a phone that also holds a child's practice: the parent area locks
-- itself and asks for the password again.
ALTER TABLE sessions ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN unlocked_until INTEGER NOT NULL DEFAULT 0;

CREATE TABLE passkeys (
  id           TEXT PRIMARY KEY,           -- credential ID, base64url
  parent_id    TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  public_key   TEXT NOT NULL,              -- COSE key, base64url
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT,
  label        TEXT,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkeys_parent ON passkeys(parent_id);

-- One-time WebAuthn challenges, valid for 5 minutes.
CREATE TABLE webauthn_challenges (
  id         TEXT PRIMARY KEY,
  challenge  TEXT NOT NULL,
  parent_id  TEXT REFERENCES parents(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
