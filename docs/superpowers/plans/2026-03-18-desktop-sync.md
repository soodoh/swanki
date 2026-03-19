# Desktop Sign-In & Bidirectional Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional sync with push/pull, conflict resolution, media transfer, and a settings UI to the Swanki desktop app.

**Architecture:** Extend the existing pull-only sync with a symmetric push endpoint. Migrate all syncable tables to UUID text primary keys for sync-stable identity. Use last-write-wins (timestamp) conflict resolution. Track deletions via a tombstone table. Media files transfer separately from data via hash-based deduplication.

**Tech Stack:** Drizzle ORM, better-sqlite3 (desktop), bun:sqlite (web/tests), Electron IPC, TanStack Router, React

**Spec:** `docs/superpowers/specs/2026-03-18-desktop-sync-design.md`

---

## File Structure

### New Files

- `apps/web/drizzle/0002_uuid_migration.sql` — migration: UUID PKs, tombstone table, updatedAt on cardTemplates
- `packages/core/src/services/sync-types.ts` — shared sync request/response types
- `apps/web/src/routes/api/sync/push.ts` — push endpoint route
- `apps/web/src/routes/api/sync/media/upload.ts` — media upload endpoint
- `apps/web/src/routes/api/sync/media/download.ts` — media download endpoint
- `apps/web/src/routes/settings.tsx` — settings page UI
- `apps/web/src/__tests__/lib/services/sync-service.test.ts` — sync service tests

### Modified Files

- `packages/core/src/db/schema.ts` — UUID PKs, tombstone table, updatedAt on cardTemplates
- `packages/core/src/services/sync-service.ts` — add `push()`, populate deletions in pull
- `packages/core/src/services/deck-service.ts` — write tombstones on delete
- `packages/core/src/services/note-service.ts` — write tombstones on delete
- `packages/core/src/services/note-type-service.ts` — write tombstones on delete
- `apps/desktop/electron/sync.ts` — add push, LWW pull, debounced auto-sync, media transfer
- `apps/desktop/electron/auth.ts` — read server URL from sync-state.json
- `apps/desktop/electron/ipc-handlers.ts` — settings IPC, sync debounce, first-sign-in flow
- `apps/desktop/src/preload.ts` — expose settings IPC channels
- `apps/web/src/__tests__/test-utils.ts` — update for UUID schema

---

## Task 1: Migrate Schema to UUID Primary Keys

**Files:**

- Modify: `packages/core/src/db/schema.ts`
- Create: `apps/web/drizzle/0002_uuid_migration.sql`
- Modify: `apps/web/src/__tests__/test-utils.ts`

This is the foundational change. All syncable tables switch from `INTEGER PRIMARY KEY AUTOINCREMENT` to `TEXT PRIMARY KEY` with UUIDs. Media uses content hash as PK.

- [ ] **Step 1: Update schema.ts — decks table**

Change `packages/core/src/db/schema.ts:12-37`. Replace `id: integer("id").primaryKey({ autoIncrement: true })` with `id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID())`. Update `parentId` from `integer` to `text`:

```typescript
export const decks = sqliteTable(
  "decks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    description: text("description").default(""),
    settings: text("settings", { mode: "json" })
      .$type<{ newCardsPerDay: number; maxReviewsPerDay: number }>()
      .default({ newCardsPerDay: 20, maxReviewsPerDay: 200 }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("decks_user_id_idx").on(table.userId),
    index("decks_parent_id_idx").on(table.parentId),
  ],
);
```

- [ ] **Step 2: Update schema.ts — noteTypes table**

Change `packages/core/src/db/schema.ts:39-57`. Same pattern — `id` becomes `text` with UUID default:

```typescript
export const noteTypes = sqliteTable(
  "note_types",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    fields: text("fields", { mode: "json" })
      .$type<Array<{ name: string; ordinal: number }>>()
      .notNull(),
    css: text("css").default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("note_types_user_id_idx").on(table.userId)],
);
```

- [ ] **Step 3: Update schema.ts — cardTemplates table**

Change `packages/core/src/db/schema.ts:59-70`. Switch to text PK, `noteTypeId` becomes text, add `updatedAt`:

```typescript
export const cardTemplates = sqliteTable(
  "card_templates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    noteTypeId: text("note_type_id").notNull(),
    name: text("name").notNull(),
    ordinal: integer("ordinal").notNull(),
    questionTemplate: text("question_template").notNull(),
    answerTemplate: text("answer_template").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("card_templates_note_type_id_idx").on(table.noteTypeId)],
);
```

- [ ] **Step 4: Update schema.ts — notes table**

Change `packages/core/src/db/schema.ts:72-95`. UUID PK, `noteTypeId` becomes text:

```typescript
export const notes = sqliteTable(
  "notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    noteTypeId: text("note_type_id").notNull(),
    fields: text("fields", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull(),
    tags: text("tags").default(""),
    ankiGuid: text("anki_guid"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("notes_user_id_idx").on(table.userId),
    index("notes_note_type_id_idx").on(table.noteTypeId),
    uniqueIndex("notes_anki_guid_idx").on(table.userId, table.ankiGuid),
  ],
);
```

- [ ] **Step 5: Update schema.ts — cards table**

Change `packages/core/src/db/schema.ts:97-131`. UUID PK, foreign key columns become text:

```typescript
export const cards = sqliteTable(
  "cards",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    noteId: text("note_id").notNull(),
    deckId: text("deck_id").notNull(),
    templateId: text("template_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    due: integer("due", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    stability: real("stability").default(0),
    difficulty: real("difficulty").default(0),
    elapsedDays: integer("elapsed_days").default(0),
    scheduledDays: integer("scheduled_days").default(0),
    reps: integer("reps").default(0),
    lapses: integer("lapses").default(0),
    state: integer("state").default(0),
    lastReview: integer("last_review", { mode: "timestamp" }),
    suspended: integer("suspended").default(0).notNull(),
    buriedUntil: integer("buried_until", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("cards_note_id_idx").on(table.noteId),
    index("cards_deck_id_idx").on(table.deckId),
    index("cards_due_idx").on(table.due),
    index("cards_state_idx").on(table.state),
  ],
);
```

- [ ] **Step 6: Update schema.ts — reviewLogs table**

Change `packages/core/src/db/schema.ts:133-155`. UUID PK, `cardId` becomes text:

```typescript
export const reviewLogs = sqliteTable(
  "review_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cardId: text("card_id").notNull(),
    rating: integer("rating").notNull(),
    state: integer("state").notNull(),
    due: integer("due", { mode: "timestamp" }).notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    lastElapsedDays: integer("last_elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    timeTakenMs: integer("time_taken_ms").notNull(),
  },
  (table) => [
    index("review_logs_card_id_idx").on(table.cardId),
    index("review_logs_reviewed_at_idx").on(table.reviewedAt),
  ],
);
```

- [ ] **Step 7: Update schema.ts — media table**

Change `packages/core/src/db/schema.ts:157-174`. Use `hash` as the PK (content-addressed):

```typescript
export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(), // content hash (SHA-256 hex)
    userId: text("user_id").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("media_user_id_idx").on(table.userId)],
);
```

Note: the `hash` column is removed — the hash IS the `id` now. Remove the `media_hash_idx` index since the PK already provides it.

- [ ] **Step 8: Update schema.ts — noteMedia table**

Change `packages/core/src/db/schema.ts:176-188`. UUID PK, foreign keys become text:

```typescript
export const noteMedia = sqliteTable(
  "note_media",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    noteId: text("note_id").notNull(),
    mediaId: text("media_id").notNull(),
  },
  (table) => [
    index("note_media_note_id_idx").on(table.noteId),
    index("note_media_media_id_idx").on(table.mediaId),
    uniqueIndex("note_media_note_media_unique").on(table.noteId, table.mediaId),
  ],
);
```

- [ ] **Step 9: Add tombstone table to schema.ts**

Add at the end of `packages/core/src/db/schema.ts`:

```typescript
export const deletions = sqliteTable(
  "deletions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tableName: text("table_name").notNull(),
    entityId: text("entity_id").notNull(),
    userId: text("user_id").notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("deletions_user_id_deleted_at_idx").on(table.userId, table.deletedAt),
  ],
);
```

- [ ] **Step 10: Write the migration SQL**

Create a hand-written migration file. The filename must follow Drizzle Kit's journal convention — after writing the SQL, manually add an entry to `apps/web/drizzle/meta/_journal.json` with the correct index and hash. Do NOT run `drizzle-kit generate` as it will conflict with the hand-written migration.

This is a destructive migration — SQLite doesn't support `ALTER COLUMN`, so we must recreate tables. For a breaking change like this, drop and recreate all data tables (auth tables are untouched):

Create `apps/web/drizzle/0002_uuid_migration.sql`:

```sql
-- Drop existing tables in reverse dependency order
DROP TABLE IF EXISTS `note_media`;
DROP TABLE IF EXISTS `review_logs`;
DROP TABLE IF EXISTS `cards`;
DROP TABLE IF EXISTS `notes`;
DROP TABLE IF EXISTS `card_templates`;
DROP TABLE IF EXISTS `note_types`;
DROP TABLE IF EXISTS `media`;
DROP TABLE IF EXISTS `decks`;

-- Recreate with text PKs
CREATE TABLE `decks` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `parent_id` text,
  `description` text DEFAULT '',
  `settings` text DEFAULT '{"newCardsPerDay":20,"maxReviewsPerDay":200}',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `decks_user_id_idx` ON `decks` (`user_id`);
CREATE INDEX `decks_parent_id_idx` ON `decks` (`parent_id`);

CREATE TABLE `note_types` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `fields` text NOT NULL,
  `css` text DEFAULT '',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `note_types_user_id_idx` ON `note_types` (`user_id`);

CREATE TABLE `card_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `note_type_id` text NOT NULL,
  `name` text NOT NULL,
  `ordinal` integer NOT NULL,
  `question_template` text NOT NULL,
  `answer_template` text NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `card_templates_note_type_id_idx` ON `card_templates` (`note_type_id`);

CREATE TABLE `notes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `note_type_id` text NOT NULL,
  `fields` text NOT NULL,
  `tags` text DEFAULT '',
  `anki_guid` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `notes_user_id_idx` ON `notes` (`user_id`);
CREATE INDEX `notes_note_type_id_idx` ON `notes` (`note_type_id`);
CREATE UNIQUE INDEX `notes_anki_guid_idx` ON `notes` (`user_id`, `anki_guid`);

CREATE TABLE `cards` (
  `id` text PRIMARY KEY NOT NULL,
  `note_id` text NOT NULL,
  `deck_id` text NOT NULL,
  `template_id` text NOT NULL,
  `ordinal` integer NOT NULL,
  `due` integer NOT NULL,
  `stability` real DEFAULT 0,
  `difficulty` real DEFAULT 0,
  `elapsed_days` integer DEFAULT 0,
  `scheduled_days` integer DEFAULT 0,
  `reps` integer DEFAULT 0,
  `lapses` integer DEFAULT 0,
  `state` integer DEFAULT 0,
  `last_review` integer,
  `suspended` integer DEFAULT 0 NOT NULL,
  `buried_until` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `cards_note_id_idx` ON `cards` (`note_id`);
CREATE INDEX `cards_deck_id_idx` ON `cards` (`deck_id`);
CREATE INDEX `cards_due_idx` ON `cards` (`due`);
CREATE INDEX `cards_state_idx` ON `cards` (`state`);

CREATE TABLE `review_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `card_id` text NOT NULL,
  `rating` integer NOT NULL,
  `state` integer NOT NULL,
  `due` integer NOT NULL,
  `stability` real NOT NULL,
  `difficulty` real NOT NULL,
  `elapsed_days` integer NOT NULL,
  `last_elapsed_days` integer NOT NULL,
  `scheduled_days` integer NOT NULL,
  `reviewed_at` integer NOT NULL,
  `time_taken_ms` integer NOT NULL
);
CREATE INDEX `review_logs_card_id_idx` ON `review_logs` (`card_id`);
CREATE INDEX `review_logs_reviewed_at_idx` ON `review_logs` (`reviewed_at`);

CREATE TABLE `media` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `filename` text NOT NULL,
  `mime_type` text NOT NULL,
  `size` integer NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `media_user_id_idx` ON `media` (`user_id`);

CREATE TABLE `note_media` (
  `id` text PRIMARY KEY NOT NULL,
  `note_id` text NOT NULL,
  `media_id` text NOT NULL
);
CREATE INDEX `note_media_note_id_idx` ON `note_media` (`note_id`);
CREATE INDEX `note_media_media_id_idx` ON `note_media` (`media_id`);
CREATE UNIQUE INDEX `note_media_note_media_unique` ON `note_media` (`note_id`, `media_id`);

-- Tombstone table for deletion tracking
CREATE TABLE `deletions` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `table_name` text NOT NULL,
  `entity_id` text NOT NULL,
  `user_id` text NOT NULL,
  `deleted_at` integer NOT NULL
);
CREATE INDEX `deletions_user_id_deleted_at_idx` ON `deletions` (`user_id`, `deleted_at`);
```

- [ ] **Step 11: Update drizzle migration journal**

Manually add an entry to `apps/web/drizzle/meta/_journal.json` for the new migration. The entry needs an index (2), a timestamp, the migration filename (without `.sql`), and a hash. Copy the format from existing entries in the journal file.

Also update `apps/web/drizzle/meta/0002_snapshot.json` — run `cd apps/web && bun x drizzle-kit generate` once after writing the SQL to let Drizzle produce the snapshot, then verify it didn't overwrite the hand-written SQL. If it did, restore the SQL and keep the snapshot.

- [ ] **Step 12: Fix all TypeScript compile errors across the codebase**

The integer→text PK change will cause type errors in every service, hook, and route that passes numeric IDs. Search and fix all occurrences:

- Service method signatures: `id: number` → `id: string`
- IPC handlers: `parseInt(...)` calls → pass string directly. **Also update regex patterns** in route matching from `(\d+)` to `([^/]+)` since IDs are now UUIDs, not integers.
- API routes: `parseInt(params.deckId)` → `params.deckId`
- Hooks: any numeric ID references
- Import parsers: ID generation during import
- Media service: `hash` column removal, use `id` as hash

Run: `cd apps/web && bun run tsc --noEmit` to find all errors. Fix each one.

- [ ] **Step 12b: Ensure noteMedia mutations bump parent note updatedAt**

The spec requires that any operation adding/removing noteMedia rows bumps the parent note's `updatedAt` so noteMedia changes are captured during push. Check `MediaService` (especially `syncNoteMedia`, `importBatch`) and `ImportService` for places where noteMedia is modified. After each noteMedia insert/delete, add an update to set the parent note's `updatedAt = new Date()`.

- [ ] **Step 12c: Update desktop sync column mappings**

Update `apps/desktop/electron/sync.ts` to match the new schema. These must be updated alongside the schema change:

1. Add `suspended` and `buriedUntil` to `TABLE_COLUMNS.cards`
2. Add `updatedAt` to `TABLE_COLUMNS.cardTemplates`
3. Remove `hash` from `TABLE_COLUMNS.media` (hash is now the `id`)
4. Add `suspended: "suspended"` and `buriedUntil: "buried_until"` to `CAMEL_TO_SNAKE`
5. Add `"buried_until"` to `TIMESTAMP_COLUMNS`

- [ ] **Step 13: Update test utilities**

Update `apps/web/src/__tests__/test-utils.ts` — no code changes needed if migration runs correctly, but verify tests can create the new schema.

- [ ] **Step 14: Run all tests**

Run: `cd apps/web && bun --bun vitest run`

Expected: All tests pass with the new UUID schema. Fix any failures.

- [ ] **Step 15: Commit**

```bash
git add -A && git commit -m "refactor: migrate all syncable tables to UUID text primary keys

Breaking schema change: all data tables now use text UUIDs as primary
keys instead of integer autoincrement. Media uses content hash as PK.
Adds tombstone table for deletion tracking and updatedAt to cardTemplates."
```

---

## Task 2: Add Tombstone Writes to Service Delete Operations

**Files:**

- Modify: `packages/core/src/services/deck-service.ts`
- Modify: `packages/core/src/services/note-service.ts`
- Modify: `packages/core/src/services/note-type-service.ts`
- Test: `apps/web/src/__tests__/lib/services/sync-service.test.ts`

- [ ] **Step 1: Write test for tombstone creation on deck delete**

Create `apps/web/src/__tests__/lib/services/tombstone.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createTestDb } from "../../test-utils";
import { DeckService } from "@swanki/core/services/deck-service";
import { deletions } from "@swanki/core/db/schema";
import { eq } from "drizzle-orm";

describe("Tombstone tracking", () => {
  it("creates tombstone when deck is deleted", async () => {
    const db = createTestDb();
    const deckService = new DeckService(db, "/tmp", {
      join: (...parts: string[]) => parts.join("/"),
      exists: async () => false,
      unlink: async () => {},
      readFile: async () => Buffer.from(""),
      writeFile: async () => {},
      mkdir: async () => {},
    });

    const deck = await deckService.create("user1", { name: "Test" });
    await deckService.delete(deck.id, "user1");

    const tombstones = db
      .select()
      .from(deletions)
      .where(eq(deletions.userId, "user1"))
      .all();

    expect(tombstones.length).toBeGreaterThanOrEqual(1);
    expect(
      tombstones.some((t) => t.tableName === "decks" && t.entityId === deck.id),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/tombstone.test.ts`

Expected: FAIL — deletions table has no rows because services don't write tombstones yet.

- [ ] **Step 3: Add tombstone writes to DeckService.delete()**

Modify `packages/core/src/services/deck-service.ts`. Import `deletions` from schema. After each entity delete in the cascade, write a tombstone. Add tombstones for: the deck itself, cascaded cards, cascaded notes, cascaded noteTypes, cascaded cardTemplates, cascaded media, cascaded noteMedia.

Key insertion point: before the final deck delete at line ~237, and after each cascaded delete (review logs, cards, notes, noteTypes, templates, media, noteMedia).

- [ ] **Step 4: Add tombstone writes to NoteService.delete()**

Modify `packages/core/src/services/note-service.ts`. After deleting cards for a note and the note itself, write tombstones for each deleted card and the note.

- [ ] **Step 5: Add tombstone writes to NoteTypeService.delete()**

Modify `packages/core/src/services/note-type-service.ts`. After deleting templates and the note type, write tombstones for each deleted template and the note type.

- [ ] **Step 6: Run tests**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/tombstone.test.ts`

Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `cd apps/web && bun --bun vitest run`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: write tombstones on entity deletion for sync tracking"
```

---

## Task 3: Update SyncService — Deletions in Pull + Push Method

**Files:**

- Modify: `packages/core/src/services/sync-service.ts`
- Create: `packages/core/src/services/sync-types.ts`
- Test: `apps/web/src/__tests__/lib/services/sync-service.test.ts`

- [ ] **Step 1: Create shared sync types**

Create `packages/core/src/services/sync-types.ts`:

```typescript
export type SyncPushRequest = {
  decks: Array<Record<string, unknown>>;
  noteTypes: Array<Record<string, unknown>>;
  cardTemplates: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  reviewLogs: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
  noteMedia: Array<Record<string, unknown>>;
  deletions: Array<{ tableName: string; entityId: string; deletedAt: number }>;
};

export type SyncPushResponse = {
  conflicts: Array<{
    tableName: string;
    entityId: string;
    winner: "server" | "client";
  }>;
  mediaToUpload: string[];
  pushedAt: number;
};

export type SyncPullResponse = {
  decks: Array<Record<string, unknown>>;
  noteTypes: Array<Record<string, unknown>>;
  cardTemplates: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  reviewLogs: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
  noteMedia: Array<Record<string, unknown>>;
  deletions: Array<{ tableName: string; entityId: string; deletedAt: number }>;
  syncedAt: number;
};
```

- [ ] **Step 2: Write test for deletions in pullDelta**

Add to `apps/web/src/__tests__/lib/services/sync-service.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createTestDb } from "../../test-utils";
import { SyncService } from "@swanki/core/services/sync-service";
import { DeckService } from "@swanki/core/services/deck-service";

describe("SyncService", () => {
  it("pullDelta includes deletions from tombstone table", async () => {
    const db = createTestDb();
    const syncService = new SyncService(db);
    const deckService = new DeckService(db, "/tmp", {
      join: (...p: string[]) => p.join("/"),
      exists: async () => false,
      unlink: async () => {},
      readFile: async () => Buffer.from(""),
      writeFile: async () => {},
      mkdir: async () => {},
    });

    const deck = await deckService.create("user1", { name: "Test" });
    const beforeDelete = Date.now();
    await deckService.delete(deck.id, "user1");

    const result = await syncService.pullDelta("user1", beforeDelete);
    expect(result.deletions.length).toBeGreaterThanOrEqual(1);
    expect(
      result.deletions.some(
        (d) => d.tableName === "decks" && d.entityId === deck.id,
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/sync-service.test.ts`

Expected: FAIL — pullDelta still returns `deletions: []`.

- [ ] **Step 4: Update pullDelta to query tombstone table**

Modify `packages/core/src/services/sync-service.ts`. Import `deletions` from schema. Replace the empty deletions return with a query:

```typescript
// At the end of pullDelta, before the return:
const tombstones = await this.db
  .select()
  .from(deletions)
  .where(and(eq(deletions.userId, userId), gte(deletions.deletedAt, sinceDate)))
  .all();

const deletionsList = tombstones.map((t) => ({
  tableName: t.tableName,
  entityId: t.entityId,
  deletedAt: Math.floor(t.deletedAt.getTime() / 1000),
}));
```

Update the return to use `deletionsList` instead of `[]`.

- [ ] **Step 5: Run test**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/sync-service.test.ts`

Expected: PASS

- [ ] **Step 6: Write test for push method**

Add to the same test file:

```typescript
it("push inserts new entities and resolves conflicts with LWW", async () => {
  const db = createTestDb();
  const syncService = new SyncService(db);

  // Push a new deck
  const result = await syncService.push("user1", {
    decks: [
      {
        id: "deck-1",
        userId: "user1",
        name: "Pushed Deck",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    noteTypes: [],
    cardTemplates: [],
    notes: [],
    cards: [],
    reviewLogs: [],
    media: [],
    noteMedia: [],
    deletions: [],
  });

  expect(result.pushedAt).toBeGreaterThan(0);

  // Verify deck was inserted
  const pullResult = await syncService.pullFull("user1");
  expect(pullResult.decks.some((d: any) => d.id === "deck-1")).toBe(true);
});
```

- [ ] **Step 7: Implement SyncService.push()**

Add `push()` method to `packages/core/src/services/sync-service.ts`. Also remove the existing `SyncPullResponse` type from this file and import it from the new `sync-types.ts` instead.

The push method signature: `async push(userId: string, payload: SyncPushRequest): Promise<SyncPushResponse>`

Implementation algorithm:

1. **Process tables in FK order** (noteTypes → cardTemplates → decks → notes → cards → reviewLogs → media → noteMedia). For each table's entities in the payload:
   a. Look up existing row by `id` in the database
   b. If no existing row → insert the incoming entity (set `userId` to the authenticated user for security)
   c. If existing row exists and incoming `updatedAt >= existing.updatedAt` → update (client wins). Record `{ tableName, entityId, winner: "client" }` in conflicts.
   d. If existing row exists and incoming `updatedAt < existing.updatedAt` → skip (server wins). Record `{ tableName, entityId, winner: "server" }` in conflicts.
   e. For append-only tables (reviewLogs): always insert if not exists, skip if exists (no LWW needed).
   f. For media: always insert if hash (id) not exists, skip if exists (content-addressed, identical by definition).

2. **Apply deletions last** in reverse FK order. For each incoming tombstone:
   a. Look up the entity by `entityId` in the specified table
   b. If entity exists and its `updatedAt <= deletedAt` → delete it
   c. If entity exists and its `updatedAt > deletedAt` → skip (entity was modified after deletion)
   d. Write the tombstone to the server's deletions table regardless

3. **Compute mediaToUpload**: query the `media` table for all IDs in the push payload's media array, return hashes (IDs) that don't exist in the server's media table.

4. **Return** `{ conflicts, mediaToUpload, pushedAt: Date.now() }`

Wrap the entire operation in a transaction for atomicity.

- [ ] **Step 8: Run all sync tests**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/sync-service.test.ts`

Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add push method and deletion tracking to SyncService"
```

---

## Task 4: Server Push & Media Endpoints

**Files:**

- Create: `apps/web/src/routes/api/sync/push.ts`
- Create: `apps/web/src/routes/api/sync/media/upload.ts`
- Create: `apps/web/src/routes/api/sync/media/download.ts`
- Modify: `apps/web/src/routes/api/sync/pull.ts` (update import for new types)

- [ ] **Step 1: Create push API route**

Create `apps/web/src/routes/api/sync/push.ts`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { SyncService } from "../../../lib/services/sync-service";
import { db } from "../../../db";

const syncService = new SyncService(db);

export const Route = createFileRoute("/api/sync/push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const body = await request.json();
        const result = await syncService.push(session.user.id, body);
        return Response.json(result);
      },
    },
  },
});
```

- [ ] **Step 2: Create media upload route**

Create `apps/web/src/routes/api/sync/media/upload.ts`. Accept POST with binary body. The media hash is passed in the `X-Media-Hash` header. The server:

1. Calls `requireSession(request)` for auth
2. Reads the hash from the header
3. Looks up the media record in the database by `id` (which is the hash) to get the filename
4. Writes the binary data to the server's media directory (`mediaDir` from the web app's config, same directory used by `MediaService`)
5. Returns `{ ok: true }`

The server media directory path is the same as used by `MediaService` — check how `apps/web/src/routes/api/` routes instantiate `MediaService` to find the `mediaDir` path.

- [ ] **Step 3: Create media download route**

Create `apps/web/src/routes/api/sync/media/download.ts`. Accept GET with `hash` query param. The server:

1. Calls `requireSession(request)` for auth
2. Looks up the media record by `id` (hash) to get filename and mimeType
3. Reads the file from the server's media directory
4. Returns the binary data with `Content-Type` set to the stored mimeType

- [ ] **Step 4: Verify routes work**

Run: `cd apps/web && bun run dev:web` and test with curl or a quick script.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add sync push and media transfer API endpoints"
```

---

## Task 5: Desktop Settings UI + Configurable Server URL

**Files:**

- Modify: `apps/desktop/electron/auth.ts`
- Modify: `apps/desktop/electron/sync.ts`
- Modify: `apps/desktop/electron/ipc-handlers.ts`
- Modify: `apps/desktop/src/preload.ts`
- Create: `apps/web/src/routes/settings.tsx`

- [ ] **Step 1: Extend sync-state.json to store cloudServerUrl**

Modify `apps/desktop/electron/sync.ts`. Update `getLastSyncTime()` and `setLastSyncTime()` to read/write an object that includes `cloudServerUrl` and `lastPushTime` alongside `lastSyncTime`. Add `getCloudServerUrlFromConfig()` and `setCloudServerUrl()` functions.

- [ ] **Step 2: Update auth.ts to read from config**

Modify `apps/desktop/electron/auth.ts`. Replace the hardcoded `CLOUD_SERVER_URL` constant with a function that reads from `sync-state.json`, falling back to env var, falling back to `http://localhost:3000`.

- [ ] **Step 3: Add settings IPC handlers**

Modify `apps/desktop/electron/ipc-handlers.ts`. Add:

```typescript
ipcMain.handle("settings:get", () => {
  return {
    cloudServerUrl: getCloudServerUrl(),
    signedIn: isSignedIn(),
    syncStatus: getSyncStatus(),
    lastSyncTime: getLastSyncTime(),
  };
});

ipcMain.handle(
  "settings:update",
  (_event, { cloudServerUrl }: { cloudServerUrl: string }) => {
    setCloudServerUrl(cloudServerUrl);
    return { ok: true };
  },
);
```

- [ ] **Step 4: Expose settings IPC in preload**

Modify `apps/desktop/src/preload.ts`. Add:

```typescript
settingsGet: () => ipcRenderer.invoke("settings:get"),
settingsUpdate: (data: { cloudServerUrl: string }) => ipcRenderer.invoke("settings:update", data),
```

- [ ] **Step 5: Create settings page**

Create `apps/web/src/routes/settings.tsx`. This is a TanStack Router route. On desktop, it calls IPC directly via `window.electronAPI`. On web, it's inside `_authenticated` layout and uses fetch-based API calls. Use `usePlatform()` from `@swanki/core/platform` to detect the current platform and render accordingly.

**Desktop-specific behavior** (when `platform === "desktop"`):

- Server URL: text input that calls `window.electronAPI.settingsUpdate({ cloudServerUrl })` on save
- Account: calls `window.electronAPI.authSignIn()` / `authSignOut()` / `authStatus()`
- Sync: calls `window.electronAPI.syncNow()` / `syncStatus()`

**Web-specific behavior** (when `platform === "web"`):

- Server URL: not shown (web is the server)
- Account: shows user email from session, link to `/login` for sign-out
- Sync: not applicable (web is always in sync with itself)

- [ ] **Step 6: Test settings page**

Run: `bun run start:desktop` and navigate to `/settings`. Verify:

- Server URL can be changed and persists across restart
- Sign In/Out buttons work
- Sync Now triggers sync

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add settings UI with configurable server URL"
```

---

## Task 6: Desktop Push + LWW Pull + Auto-Sync

**Files:**

- Modify: `apps/desktop/electron/sync.ts`
- Modify: `apps/desktop/electron/ipc-handlers.ts`

This is the core desktop sync rewrite — adding push, LWW on pull, and debounced auto-sync.

- [ ] **Step 1: Add push capability to sync.ts**

Add `syncPush()` function to `apps/desktop/electron/sync.ts`:

1. Query local DB for changed entities per table using these timestamp columns:
   - `decks, noteTypes, notes, cards, cardTemplates`: `updatedAt > lastPushTime`
   - `reviewLogs`: `reviewedAt > lastPushTime` (append-only)
   - `media`: `createdAt > lastPushTime` (immutable)
   - `noteMedia`: collect all noteMedia rows for any note where `notes.updatedAt > lastPushTime` (noteMedia has no timestamps; changes are captured through parent note's updatedAt)
2. Query local tombstones with `deletedAt > lastPushTime`
3. Build `SyncPushRequest` payload
4. POST to `${serverUrl}/api/sync/push` with session cookie
5. Handle response: store `pushedAt` as `lastPushTime`, upload requested media files

- [ ] **Step 2: Update syncPull with LWW logic**

Modify `syncPull()` in `apps/desktop/electron/sync.ts`. Replace `INSERT OR REPLACE` with LWW comparison:

- For each incoming row, check if a local row exists with the same ID
- If no local row → insert
- If incoming `updatedAt >= local.updatedAt` → update
- If incoming `updatedAt < local.updatedAt` → skip

Update `TABLE_COLUMNS` to include `suspended` and `buriedUntil` for cards.

- [ ] **Step 3: Update syncPull deletions handling**

Update the deletions section to handle the new format with `deletedAt` timestamps:

- For each server tombstone, look up local row
- If local `updatedAt <= deletedAt` → delete locally
- If local `updatedAt > deletedAt` → skip (local edit is newer than deletion)

- [ ] **Step 4: Create sync cycle function**

Add `syncCycle()` that runs push then pull:

```typescript
export async function syncCycle(
  db: AppDb,
  rawDb: Database.Database,
): Promise<void> {
  await syncPush(db, rawDb);
  await syncPull(db, rawDb);
}
```

- [ ] **Step 5: Add debounced auto-sync**

Add debounce mechanism to `apps/desktop/electron/sync.ts`:

```typescript
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000;

export function scheduleSyncAfterMutation(
  db: AppDb,
  rawDb: Database.Database,
): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (getToken()) void syncCycle(db, rawDb);
  }, DEBOUNCE_MS);
}
```

- [ ] **Step 6: Trigger debounced sync from IPC mutations**

Modify `apps/desktop/electron/ipc-handlers.ts`. After every successful mutation handler, call `scheduleSyncAfterMutation(db, rawDb)`:

```typescript
// At the end of each mutation case that modifies data:
scheduleSyncAfterMutation(db, rawDb);
```

- [ ] **Step 7: Update periodic sync to use syncCycle**

Modify `startPeriodicSync` to call `syncCycle` instead of just `syncPull`.

- [ ] **Step 8: Update sync:now handler**

Modify IPC handler for `sync:now` to call `syncCycle` instead of `syncPull`.

- [ ] **Step 9: Test locally**

Run web dev server: `bun run dev:web`
Run desktop: `bun run start:desktop`

1. Sign in on web, create a deck
2. Sign in on desktop (pointing to localhost:3000)
3. Verify deck appears on desktop after sync
4. Create a deck on desktop
5. Verify it appears on web after sync

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: add bidirectional push/pull with LWW and auto-sync"
```

---

## Task 7: First Sign-In Flow (Merge/Replace Dialog)

**Files:**

- Modify: `apps/desktop/electron/ipc-handlers.ts`
- Modify: `apps/desktop/electron/sync.ts`
- Modify: `apps/desktop/src/preload.ts`

- [ ] **Step 1: Add merge/replace IPC flow**

Modify `auth:sign-in` handler in `apps/desktop/electron/ipc-handlers.ts`:

After successful token extraction, check if local data exists. If it does, return `{ signedIn: true, hasLocalData: true }` to the renderer. The renderer shows a dialog asking merge vs replace, then calls a new IPC channel:

```typescript
ipcMain.handle(
  "auth:complete-sign-in",
  async (_event, { strategy }: { strategy: "merge" | "replace" }) => {
    if (strategy === "merge") {
      // Re-assign local userId to cloud userId
      // Push all local data
      // Pull server data
    } else {
      // Delete all local data
      // Full pull from server
    }
    startPeriodicSync(db, rawDb);
    return { ok: true };
  },
);
```

- [ ] **Step 2: Implement userId reassignment for merge**

Add function to `apps/desktop/electron/sync.ts` that updates `userId` on all local entities from the local user ID to the cloud user ID. This is a raw SQL operation across all tables that have a `user_id` column.

- [ ] **Step 3: Expose new IPC channel in preload**

Add `authCompleteSignIn` to `apps/desktop/src/preload.ts`.

- [ ] **Step 4: Update settings page to show merge/replace dialog**

When sign-in returns `hasLocalData: true`, show a dialog/modal on the settings page asking the user to choose merge or replace. Call `authCompleteSignIn` with their choice.

- [ ] **Step 5: Test the flow**

1. Start desktop with no account (creates local user, add some data)
2. Sign in
3. Verify dialog appears
4. Test merge: verify local data pushed to server + server data pulled
5. Test replace: verify local data gone, server data present

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add first sign-in merge/replace dialog"
```

---

## Task 8: Media File Sync

**Files:**

- Modify: `apps/desktop/electron/sync.ts`

- [ ] **Step 1: Add media upload to push flow**

After `syncPush()` receives `mediaToUpload` hashes in the response, upload each file:

```typescript
for (const hash of response.mediaToUpload) {
  const filePath = join(mediaDir, hash); // or find by hash in media dir
  if (existsSync(filePath)) {
    const fileData = readFileSync(filePath);
    await fetch(`${serverUrl}/api/sync/media/upload`, {
      method: "POST",
      headers: {
        Cookie: `better-auth.session_token=${token}`,
        "Content-Type": "application/octet-stream",
        "X-Media-Hash": hash,
      },
      body: fileData,
    });
  }
}
```

- [ ] **Step 2: Add media download to pull flow**

After `syncPull()` receives media metadata, download missing files:

```typescript
for (const mediaRow of data.media) {
  const hash = mediaRow.id as string;
  const localPath = join(mediaDir, mediaRow.filename as string);
  if (!existsSync(localPath)) {
    const res = await fetch(
      `${serverUrl}/api/sync/media/download?hash=${hash}`,
      {
        headers: { Cookie: `better-auth.session_token=${token}` },
      },
    );
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      writeFileSync(localPath, buffer);
    }
  }
}
```

- [ ] **Step 3: Test media sync**

1. Import an APKG with images on web
2. Sync to desktop
3. Verify images appear in study view on desktop
4. Import an APKG with audio on desktop
5. Sync to web
6. Verify audio plays on web

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add media file upload/download to sync cycle"
```

---

## Task 9: Final Integration Testing

- [ ] **Step 1: Run full web test suite**

Run: `cd apps/web && bun --bun vitest run`

Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `bun run lint`

Fix any issues.

- [ ] **Step 3: Build desktop**

Run: `bun run build:desktop`

Verify no build errors.

- [ ] **Step 4: Manual end-to-end test**

1. Start web server: `bun run dev:web`
2. Create account on web, add decks, notes, study some cards
3. Start desktop: `bun run start:desktop`
4. Open settings, set server URL to `http://localhost:3000`
5. Sign in → choose "Replace with cloud"
6. Verify all web data appears on desktop
7. Create a new deck on desktop
8. Wait 5 seconds (debounce) → verify it appears on web
9. Delete a deck on web → trigger sync on desktop → verify deleted
10. Sign out on desktop → verify sync stops
11. Sign back in → choose "Merge" → verify data merged correctly

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A && git commit -m "fix: integration test fixes for bidirectional sync"
```
