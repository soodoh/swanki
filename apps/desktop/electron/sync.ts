/**
 * Desktop cloud sync engine.
 * Pushes local changes to and pulls remote changes from the cloud server,
 * using LWW (last-writer-wins) conflict resolution.
 */
import type { AppDb } from "@swanki/core/db";
import type Database from "better-sqlite3";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { getToken, getCloudServerUrl, clearToken } from "./auth";

// ── Sync response/request types ──────────────────────────────────────

type SyncPullResponse = {
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

type SyncPushRequest = {
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

type SyncPushResponse = {
  conflicts: Array<{
    tableName: string;
    entityId: string;
    winner: "server" | "client";
  }>;
  mediaToUpload: string[];
  pushedAt: number;
};

// ── Column mappings (camelCase JS → snake_case SQL) ─────────────────

const CAMEL_TO_SNAKE: Record<string, string> = {
  userId: "user_id",
  parentId: "parent_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  noteTypeId: "note_type_id",
  questionTemplate: "question_template",
  answerTemplate: "answer_template",
  noteId: "note_id",
  deckId: "deck_id",
  templateId: "template_id",
  elapsedDays: "elapsed_days",
  scheduledDays: "scheduled_days",
  lastReview: "last_review",
  cardId: "card_id",
  lastElapsedDays: "last_elapsed_days",
  reviewedAt: "reviewed_at",
  timeTakenMs: "time_taken_ms",
  mimeType: "mime_type",
  mediaId: "media_id",
  ankiGuid: "anki_guid",
  suspended: "suspended",
  buriedUntil: "buried_until",
};

function toSnake(key: string): string {
  return CAMEL_TO_SNAKE[key] ?? key;
}

/** JS column names for each table, in the order they appear in the schema. */
const TABLE_COLUMNS: Record<string, string[]> = {
  decks: [
    "id",
    "userId",
    "name",
    "parentId",
    "description",
    "settings",
    "createdAt",
    "updatedAt",
  ],
  noteTypes: [
    "id",
    "userId",
    "name",
    "fields",
    "css",
    "createdAt",
    "updatedAt",
  ],
  cardTemplates: [
    "id",
    "noteTypeId",
    "name",
    "ordinal",
    "questionTemplate",
    "answerTemplate",
    "updatedAt",
  ],
  notes: [
    "id",
    "userId",
    "noteTypeId",
    "fields",
    "tags",
    "ankiGuid",
    "createdAt",
    "updatedAt",
  ],
  cards: [
    "id",
    "noteId",
    "deckId",
    "templateId",
    "ordinal",
    "due",
    "stability",
    "difficulty",
    "elapsedDays",
    "scheduledDays",
    "reps",
    "lapses",
    "state",
    "lastReview",
    "suspended",
    "buriedUntil",
    "createdAt",
    "updatedAt",
  ],
  reviewLogs: [
    "id",
    "cardId",
    "rating",
    "state",
    "due",
    "stability",
    "difficulty",
    "elapsedDays",
    "lastElapsedDays",
    "scheduledDays",
    "reviewedAt",
    "timeTakenMs",
  ],
  media: ["id", "userId", "filename", "mimeType", "size", "createdAt"],
  noteMedia: ["id", "noteId", "mediaId"],
};

/** Columns whose values represent timestamps and may need conversion. */
const TIMESTAMP_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "due",
  "last_review",
  "reviewed_at",
  "buried_until",
]);

/** Convert a server timestamp value to a unix-epoch-seconds integer. */
function toSqliteTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
    return Math.floor(new Date(value).getTime() / 1000);
  }
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  return null;
}

/**
 * Mapping from sync response key to [SQL table name, JS column names].
 * Order matters: parent tables before children for FK constraints.
 */
const SYNC_TABLE_MAP: Array<[keyof SyncPullResponse, string, string[]]> = [
  ["decks", "decks", TABLE_COLUMNS.decks],
  ["noteTypes", "note_types", TABLE_COLUMNS.noteTypes],
  ["cardTemplates", "card_templates", TABLE_COLUMNS.cardTemplates],
  ["notes", "notes", TABLE_COLUMNS.notes],
  ["cards", "cards", TABLE_COLUMNS.cards],
  ["reviewLogs", "review_logs", TABLE_COLUMNS.reviewLogs],
  ["media", "media", TABLE_COLUMNS.media],
  ["noteMedia", "note_media", TABLE_COLUMNS.noteMedia],
];

// Tables listed in reverse dependency order for safe deletion
const DELETE_ORDER = [...SYNC_TABLE_MAP].reverse();

/**
 * Mapping from camelCase table name (as used in sync types / tombstones)
 * to the actual SQL table name.
 */
const TABLE_NAME_TO_SQL: Record<string, string> = {
  decks: "decks",
  noteTypes: "note_types",
  note_types: "note_types",
  cardTemplates: "card_templates",
  card_templates: "card_templates",
  notes: "notes",
  cards: "cards",
  reviewLogs: "review_logs",
  review_logs: "review_logs",
  media: "media",
  noteMedia: "note_media",
  note_media: "note_media",
};

/**
 * Tables that have an updated_at column and support LWW conflict resolution.
 * Tables not in this set use INSERT OR IGNORE (append-only / content-addressed).
 */
const TABLES_WITH_UPDATED_AT = new Set([
  "decks",
  "note_types",
  "card_templates",
  "notes",
  "cards",
]);

// ── Sync state persistence ──────────────────────────────────────────

const SYNC_STATE_PATH = join(app.getPath("userData"), "sync-state.json");

type SyncState = {
  lastSyncTime?: number | null;
  lastPushTime?: number | null;
  cloudServerUrl?: string | null;
};

function readSyncState(): SyncState {
  try {
    if (existsSync(SYNC_STATE_PATH)) {
      return JSON.parse(readFileSync(SYNC_STATE_PATH, "utf-8")) as SyncState;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeSyncState(patch: Partial<SyncState>): void {
  const current = readSyncState();
  writeFileSync(SYNC_STATE_PATH, JSON.stringify({ ...current, ...patch }));
}

export function getLastSyncTime(): number | null {
  return readSyncState().lastSyncTime ?? null;
}

function setLastSyncTime(time: number): void {
  writeSyncState({ lastSyncTime: time });
}

export function getLastPushTime(): number | null {
  return readSyncState().lastPushTime ?? null;
}

export function setLastPushTime(time: number): void {
  writeSyncState({ lastPushTime: time });
}

export function getCloudServerUrlFromConfig(): string | null {
  return readSyncState().cloudServerUrl ?? null;
}

export function setCloudServerUrl(url: string): void {
  writeSyncState({ cloudServerUrl: url });
}

// ── Media directory ─────────────────────────────────────────────────

let mediaDirPath: string = "";

/**
 * Set the media directory path. Must be called during app initialization
 * before any sync functions run.
 */
export function initMediaDir(dir: string): void {
  mediaDirPath = dir;
}

// ── Status tracking ─────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "error";

let currentStatus: SyncStatus = "idle";
let statusCallback: ((status: SyncStatus) => void) | null = null;

export function onSyncStatusChange(cb: (status: SyncStatus) => void): void {
  statusCallback = cb;
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

function setStatus(status: SyncStatus): void {
  currentStatus = status;
  statusCallback?.(status);
}

// ── Upsert helpers (raw SQL via better-sqlite3) ─────────────────────

/**
 * Build a prepared INSERT OR REPLACE statement for a table.
 */
function buildUpsertStmt(
  rawDb: Database.Database,
  tableName: string,
  jsColumns: string[],
): Database.Statement {
  const sqlColumns = jsColumns.map(toSnake);
  const placeholders = sqlColumns.map(() => "?").join(", ");
  return rawDb.prepare(
    `INSERT OR REPLACE INTO ${tableName} (${sqlColumns.join(", ")}) VALUES (${placeholders})`,
  );
}

/**
 * Build a prepared INSERT OR IGNORE statement for a table.
 */
function buildInsertIgnoreStmt(
  rawDb: Database.Database,
  tableName: string,
  jsColumns: string[],
): Database.Statement {
  const sqlColumns = jsColumns.map(toSnake);
  const placeholders = sqlColumns.map(() => "?").join(", ");
  return rawDb.prepare(
    `INSERT OR IGNORE INTO ${tableName} (${sqlColumns.join(", ")}) VALUES (${placeholders})`,
  );
}

/**
 * Prepare the value array for a single row, handling JSON serialisation
 * and timestamp conversion.
 */
function rowValues(
  jsColumns: string[],
  row: Record<string, unknown>,
): unknown[] {
  return jsColumns.map((col) => {
    let val = row[col];
    const sqlCol = toSnake(col);

    // JSON columns (settings, fields) — stringify objects
    if (
      val !== null &&
      val !== undefined &&
      typeof val === "object" &&
      !(val instanceof Date)
    ) {
      val = JSON.stringify(val);
    }

    // Timestamp columns — normalise to epoch seconds
    if (TIMESTAMP_COLUMNS.has(sqlCol)) {
      return toSqliteTimestamp(val);
    }

    return val ?? null;
  });
}

// ── Push helpers ─────────────────────────────────────────────────────

/**
 * Convert a raw SQLite row (snake_case keys, epoch-second timestamps)
 * to a camelCase record with epoch-millisecond timestamps, suitable
 * for the server push payload.
 */
function sqlRowToCamelCase(
  row: Record<string, unknown>,
  jsColumns: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const camelCol of jsColumns) {
    const snakeCol = toSnake(camelCol);
    let val = row[snakeCol];
    // JSON columns — parse stringified JSON
    if (
      typeof val === "string" &&
      (camelCol === "settings" || camelCol === "fields")
    ) {
      try {
        val = JSON.parse(val);
      } catch {
        /* keep as string */
      }
    }
    // Timestamp columns — convert epoch seconds to epoch ms for the server
    if (TIMESTAMP_COLUMNS.has(snakeCol) && typeof val === "number") {
      // SQLite stores epoch seconds; server expects epoch ms
      val = val * 1000;
    }
    result[camelCol] = val ?? null;
  }
  return result;
}

// ── Core sync push ──────────────────────────────────────────────────

/**
 * Push local changes to the cloud server.
 * Queries for rows modified since the last push and sends them upstream.
 */
export async function syncPush(
  _db: AppDb,
  rawDb: Database.Database,
): Promise<void> {
  const token = getToken();
  if (!token) return; // Not signed in

  const lastPush = getLastPushTime();
  // Convert lastPushTime (epoch ms) to epoch seconds for SQLite comparison.
  // If no previous push, use 0 to push everything.
  const sinceEpochSec = lastPush ? Math.floor(lastPush / 1000) : 0;

  // Build the push payload by querying each table for changed rows
  const payload: SyncPushRequest = {
    decks: [],
    noteTypes: [],
    cardTemplates: [],
    notes: [],
    cards: [],
    reviewLogs: [],
    media: [],
    noteMedia: [],
    deletions: [],
  };

  // Tables with updatedAt: decks, noteTypes, notes, cards, cardTemplates
  const changedDecks = rawDb
    .prepare("SELECT * FROM decks WHERE updated_at > ?")
    .all(sinceEpochSec) as Array<Record<string, unknown>>;
  payload.decks = changedDecks.map((r) =>
    sqlRowToCamelCase(r, TABLE_COLUMNS.decks),
  );

  const changedNoteTypes = rawDb
    .prepare("SELECT * FROM note_types WHERE updated_at > ?")
    .all(sinceEpochSec) as Array<Record<string, unknown>>;
  payload.noteTypes = changedNoteTypes.map((r) =>
    sqlRowToCamelCase(r, TABLE_COLUMNS.noteTypes),
  );

  const changedCardTemplates = rawDb
    .prepare("SELECT * FROM card_templates WHERE updated_at > ?")
    .all(sinceEpochSec) as Array<Record<string, unknown>>;
  payload.cardTemplates = changedCardTemplates.map((r) =>
    sqlRowToCamelCase(r, TABLE_COLUMNS.cardTemplates),
  );

  const changedNotes = rawDb
    .prepare("SELECT * FROM notes WHERE updated_at > ?")
    .all(sinceEpochSec) as Array<Record<string, unknown>>;
  payload.notes = changedNotes.map((r) =>
    sqlRowToCamelCase(r, TABLE_COLUMNS.notes),
  );

  const changedCards = rawDb
    .prepare("SELECT * FROM cards WHERE updated_at > ?")
    .all(sinceEpochSec) as Array<Record<string, unknown>>;
  payload.cards = changedCards.map((r) =>
    sqlRowToCamelCase(r, TABLE_COLUMNS.cards),
  );

  // reviewLogs: append-only, use reviewed_at
  const changedReviewLogs = rawDb
    .prepare("SELECT * FROM review_logs WHERE reviewed_at > ?")
    .all(sinceEpochSec) as Array<Record<string, unknown>>;
  payload.reviewLogs = changedReviewLogs.map((r) =>
    sqlRowToCamelCase(r, TABLE_COLUMNS.reviewLogs),
  );

  // media: immutable, use created_at
  const changedMedia = rawDb
    .prepare("SELECT * FROM media WHERE created_at > ?")
    .all(sinceEpochSec) as Array<Record<string, unknown>>;
  payload.media = changedMedia.map((r) =>
    sqlRowToCamelCase(r, TABLE_COLUMNS.media),
  );

  // noteMedia: collect all noteMedia rows for notes with updated_at > sinceEpochSec
  // noteMedia has no timestamps; changes are captured through parent note's updatedAt
  const changedNoteMedia = rawDb
    .prepare(
      `SELECT nm.* FROM note_media nm
       INNER JOIN notes n ON nm.note_id = n.id
       WHERE n.updated_at > ?`,
    )
    .all(sinceEpochSec) as Array<Record<string, unknown>>;
  payload.noteMedia = changedNoteMedia.map((r) =>
    sqlRowToCamelCase(r, TABLE_COLUMNS.noteMedia),
  );

  // Local tombstones (deletions) since last push
  const tombstones = rawDb
    .prepare("SELECT * FROM deletions WHERE deleted_at > ?")
    .all(sinceEpochSec) as Array<Record<string, unknown>>;
  payload.deletions = tombstones.map((t) => ({
    tableName: t.table_name as string,
    entityId: t.entity_id as string,
    // deleted_at is stored as epoch seconds in SQLite; convert to epoch ms
    deletedAt: (t.deleted_at as number) * 1000,
  }));

  // Skip push if there are no changes
  const hasChanges =
    payload.decks.length > 0 ||
    payload.noteTypes.length > 0 ||
    payload.cardTemplates.length > 0 ||
    payload.notes.length > 0 ||
    payload.cards.length > 0 ||
    payload.reviewLogs.length > 0 ||
    payload.media.length > 0 ||
    payload.noteMedia.length > 0 ||
    payload.deletions.length > 0;

  if (!hasChanges) return;

  const serverUrl = getCloudServerUrl();
  const res = await fetch(`${serverUrl}/api/sync/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `better-auth.session_token=${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
    }
    throw new Error(`Sync push failed: ${res.status}`);
  }

  const result = (await res.json()) as SyncPushResponse;

  // Store pushedAt as lastPushTime (epoch ms from server)
  setLastPushTime(result.pushedAt);

  // Upload media files requested by the server
  for (const hash of result.mediaToUpload) {
    const mediaRecord = rawDb
      .prepare("SELECT filename FROM media WHERE id = ?")
      .get(hash) as { filename: string } | undefined;
    if (mediaRecord) {
      const filePath = join(mediaDirPath, mediaRecord.filename);
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
  }
}

// ── Core sync pull ──────────────────────────────────────────────────

/**
 * Pull data from the cloud server and apply it to the local DB.
 * On first sync (no lastSyncTime) a full pull is performed which
 * replaces all local data. Subsequent calls do a delta pull with
 * LWW conflict resolution.
 */
export async function syncPull(
  _db: AppDb,
  rawDb: Database.Database,
): Promise<void> {
  const token = getToken();
  if (!token) return; // Not signed in

  setStatus("syncing");

  try {
    const lastSync = getLastSyncTime();
    const serverUrl = getCloudServerUrl();
    const url = lastSync
      ? `${serverUrl}/api/sync/pull?since=${lastSync}`
      : `${serverUrl}/api/sync/pull`;

    const res = await fetch(url, {
      headers: { Cookie: `better-auth.session_token=${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Token expired or invalid — clear stored credentials
        clearToken();
      }
      throw new Error(`Sync pull failed: ${res.status}`);
    }

    const data = (await res.json()) as SyncPullResponse;
    const isFull = !lastSync;

    // Apply everything in a single transaction
    const applySync = rawDb.transaction(() => {
      // Full sync: wipe tables in reverse-dependency order
      if (isFull) {
        for (const [, tableName] of DELETE_ORDER) {
          rawDb.prepare(`DELETE FROM ${tableName}`).run();
        }
      }

      // Upsert rows in dependency order with LWW conflict resolution
      for (const [key, tableName, jsColumns] of SYNC_TABLE_MAP) {
        const rows = data[key] as Array<Record<string, unknown>>;
        if (!rows || rows.length === 0) continue;

        if (isFull) {
          // Full sync: blind INSERT (tables are empty)
          const stmt = buildUpsertStmt(rawDb, tableName, jsColumns);
          for (const row of rows) {
            stmt.run(...rowValues(jsColumns, row));
          }
        } else if (tableName === "review_logs") {
          // Append-only: INSERT OR IGNORE (skip if already exists)
          const stmt = buildInsertIgnoreStmt(rawDb, tableName, jsColumns);
          for (const row of rows) {
            stmt.run(...rowValues(jsColumns, row));
          }
        } else if (tableName === "media") {
          // Content-addressed: INSERT OR IGNORE
          const stmt = buildInsertIgnoreStmt(rawDb, tableName, jsColumns);
          for (const row of rows) {
            stmt.run(...rowValues(jsColumns, row));
          }
        } else if (tableName === "note_media") {
          // Simple join table: INSERT OR REPLACE
          const stmt = buildUpsertStmt(rawDb, tableName, jsColumns);
          for (const row of rows) {
            stmt.run(...rowValues(jsColumns, row));
          }
        } else if (TABLES_WITH_UPDATED_AT.has(tableName)) {
          // LWW: compare updatedAt before writing
          const selectStmt = rawDb.prepare(
            `SELECT updated_at FROM ${tableName} WHERE id = ?`,
          );
          const upsertStmt = buildUpsertStmt(rawDb, tableName, jsColumns);

          for (const row of rows) {
            const id = row.id as string;
            const local = selectStmt.get(id) as
              | { updated_at: number | null }
              | undefined;

            if (!local) {
              // No local row — insert
              upsertStmt.run(...rowValues(jsColumns, row));
            } else {
              // Compare timestamps: incoming is from server (may be ISO string or epoch ms)
              const incomingUpdatedAt = toSqliteTimestamp(row.updatedAt);
              const localUpdatedAt = local.updated_at ?? 0;
              if (
                incomingUpdatedAt !== null &&
                incomingUpdatedAt >= localUpdatedAt
              ) {
                // Server is newer or equal — update
                upsertStmt.run(...rowValues(jsColumns, row));
              }
              // Otherwise local is newer — skip
            }
          }
        } else {
          // Fallback: INSERT OR REPLACE
          const stmt = buildUpsertStmt(rawDb, tableName, jsColumns);
          for (const row of rows) {
            stmt.run(...rowValues(jsColumns, row));
          }
        }
      }

      // Apply deletions (delta sync with LWW)
      if (!isFull && data.deletions.length > 0) {
        for (const { tableName, entityId, deletedAt } of data.deletions) {
          const sqlTable = TABLE_NAME_TO_SQL[tableName];
          if (!sqlTable) continue;

          if (TABLES_WITH_UPDATED_AT.has(sqlTable)) {
            // LWW: only delete if local updatedAt <= deletedAt
            const local = rawDb
              .prepare(`SELECT updated_at FROM ${sqlTable} WHERE id = ?`)
              .get(entityId) as { updated_at: number | null } | undefined;

            if (local) {
              const localUpdatedAt = local.updated_at ?? 0;
              // deletedAt from server is epoch ms; convert to epoch seconds for comparison
              const deletedAtSec = Math.floor(deletedAt / 1000);
              if (localUpdatedAt <= deletedAtSec) {
                rawDb
                  .prepare(`DELETE FROM ${sqlTable} WHERE id = ?`)
                  .run(entityId);
              }
              // If local updatedAt > deletedAt, entity was modified after delete — skip
            }
          } else {
            // Tables without updatedAt (reviewLogs, media, noteMedia): always delete
            rawDb.prepare(`DELETE FROM ${sqlTable} WHERE id = ?`).run(entityId);
          }
        }
      }
    });

    applySync();

    // Download missing media files
    if (data.media.length > 0 && mediaDirPath) {
      for (const mediaRow of data.media) {
        const hash = mediaRow.id as string;
        const filename = mediaRow.filename as string;
        const localPath = join(mediaDirPath, filename);
        if (!existsSync(localPath)) {
          try {
            const mediaRes = await fetch(
              `${serverUrl}/api/sync/media/download?hash=${hash}`,
              {
                headers: { Cookie: `better-auth.session_token=${token}` },
              },
            );
            if (mediaRes.ok) {
              const buffer = Buffer.from(await mediaRes.arrayBuffer());
              writeFileSync(localPath, buffer);
            }
          } catch {
            // Media download failure doesn't block data sync; retry next cycle
          }
        }
      }
    }

    setLastSyncTime(data.syncedAt);
    setStatus("idle");
  } catch (e) {
    console.error("Sync error:", e);
    setStatus("error");
  }
}

// ── Sync cycle (push then pull) ─────────────────────────────────────

/**
 * Run a full sync cycle: push local changes, then pull remote changes.
 */
export async function syncCycle(
  db: AppDb,
  rawDb: Database.Database,
): Promise<void> {
  const token = getToken();
  if (!token) return;

  setStatus("syncing");

  try {
    await syncPush(db, rawDb);
    await syncPull(db, rawDb);
    // syncPull sets status to idle/error on its own
  } catch (e) {
    console.error("Sync cycle error:", e);
    setStatus("error");
  }
}

// ── Debounced auto-sync ─────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000;

/**
 * Schedule a sync cycle after a local mutation.
 * Debounces: if called multiple times within DEBOUNCE_MS, only the last
 * call triggers the actual sync.
 */
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

// ── Periodic sync ───────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startPeriodicSync(db: AppDb, rawDb: Database.Database): void {
  if (syncInterval) return;
  syncInterval = setInterval(() => {
    if (getToken()) {
      void syncCycle(db, rawDb);
    }
  }, SYNC_INTERVAL_MS);
}

export function stopPeriodicSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// ── User ID reassignment (for merge on first sign-in) ────────────────

/**
 * Reassign all local data from oldUserId to newUserId.
 * Used during the "merge" flow when signing in for the first time:
 * local data was created under a temporary local user ID and needs
 * to be claimed by the cloud account's user ID.
 */
export function reassignUserId(
  rawDb: Database.Database,
  oldUserId: string,
  newUserId: string,
): void {
  const tables = ["decks", "note_types", "notes", "media", "deletions"];
  const tx = rawDb.transaction(() => {
    for (const table of tables) {
      rawDb
        .prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`)
        .run(newUserId, oldUserId);
    }
    // Also update the user table so the local user record matches cloud
    rawDb
      .prepare(`UPDATE user SET id = ? WHERE id = ?`)
      .run(newUserId, oldUserId);
  });
  tx();
}
