-- One-time password-reset links. Only a hash of the token is stored; links expire after an hour.

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  parent_id  TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX password_resets_parent ON password_resets(parent_id);
