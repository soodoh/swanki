/**
 * Client-side SQLite DDL for the offline database.
 * Only includes user-data tables (no auth tables).
 * Derived from the server Drizzle migrations.
 */

export const SCHEMA_VERSION = 2;

export const LOCAL_SCHEMA_DDL = `
-- Meta table for schema versioning
CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id INTEGER,
  description TEXT DEFAULT '',
  settings TEXT DEFAULT '{"newCardsPerDay":20,"maxReviewsPerDay":200}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS decks_user_id_idx ON decks (user_id);
CREATE INDEX IF NOT EXISTS decks_parent_id_idx ON decks (parent_id);

CREATE TABLE IF NOT EXISTS note_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  fields TEXT NOT NULL,
  css TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS note_types_user_id_idx ON note_types (user_id);

CREATE TABLE IF NOT EXISTS card_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_type_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  question_template TEXT NOT NULL,
  answer_template TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS card_templates_note_type_id_idx ON card_templates (note_type_id);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  note_type_id INTEGER NOT NULL,
  fields TEXT NOT NULL,
  tags TEXT DEFAULT '',
  anki_guid TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes (user_id);
CREATE INDEX IF NOT EXISTS notes_note_type_id_idx ON notes (note_type_id);
CREATE INDEX IF NOT EXISTS notes_anki_guid_idx ON notes (user_id, anki_guid);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  deck_id INTEGER NOT NULL,
  template_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  due INTEGER NOT NULL,
  stability REAL DEFAULT 0,
  difficulty REAL DEFAULT 0,
  elapsed_days INTEGER DEFAULT 0,
  scheduled_days INTEGER DEFAULT 0,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  state INTEGER DEFAULT 0,
  last_review INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_note_id_idx ON cards (note_id);
CREATE INDEX IF NOT EXISTS cards_deck_id_idx ON cards (deck_id);
CREATE INDEX IF NOT EXISTS cards_due_idx ON cards (due);
CREATE INDEX IF NOT EXISTS cards_state_idx ON cards (state);

CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  state INTEGER NOT NULL,
  due INTEGER NOT NULL,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  elapsed_days INTEGER NOT NULL,
  last_elapsed_days INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL,
  time_taken_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS review_logs_card_id_idx ON review_logs (card_id);
CREATE INDEX IF NOT EXISTS review_logs_reviewed_at_idx ON review_logs (reviewed_at);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  hash TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS media_user_id_idx ON media (user_id);
CREATE INDEX IF NOT EXISTS media_hash_idx ON media (hash);

CREATE TABLE IF NOT EXISTS note_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS note_media_note_id_idx ON note_media (note_id);
CREATE INDEX IF NOT EXISTS note_media_media_id_idx ON note_media (media_id);
CREATE UNIQUE INDEX IF NOT EXISTS note_media_note_media_unique ON note_media (note_id, media_id);

-- Tracks the last successful sync timestamp
CREATE TABLE IF NOT EXISTS _sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
