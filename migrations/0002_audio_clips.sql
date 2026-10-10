-- A parent's own recordings of the Arabic number words (one short clip per word), played to
-- their children in bilingual mode. Small (a few KB each), so they live in D1 as base64.

CREATE TABLE audio_clips (
  parent_id  TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  clip       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  data_b64   TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (parent_id, clip)
);
