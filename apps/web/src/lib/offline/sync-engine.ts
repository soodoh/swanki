/**
 * Client-side sync engine.
 * Handles pulling data from the server and upserting into the local SQL.js DB.
 */
import type { SqlJsDatabase } from "./sql-js-init";
import type { LocalDbHandle } from "./local-db";
import type { MutationQueueHandle } from "./mutation-queue";

type SyncPullResponse = {
  decks: Array<Record<string, unknown>>;
  noteTypes: Array<Record<string, unknown>>;
  cardTemplates: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  reviewLogs: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
  noteMedia: Array<Record<string, unknown>>;
  deletions: Array<{ tableName: string; rowId: string }>;
  syncedAt: number;
};

/** Column names for each table, matching the SQLite column order. */
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
  media: ["id", "userId", "filename", "hash", "mimeType", "size", "createdAt"],
  noteMedia: ["id", "noteId", "mediaId"],
};

/** Map from camelCase JS keys to snake_case SQL column names. */
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
};

function toSnake(key: string): string {
  return CAMEL_TO_SNAKE[key] ?? key;
}

/** Convert a Drizzle Date value to a unix timestamp (seconds). */
function toSqliteTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    // Could be ISO string or epoch ms
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return num;
    }
    return Math.floor(new Date(value).getTime() / 1000);
  }
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  return null;
}

/** Timestamp columns that need conversion from server format. */
const TIMESTAMP_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "due",
  "last_review",
  "reviewed_at",
]);

/**
 * Upsert rows into a table using INSERT OR REPLACE.
 */
function upsertRows(
  db: SqlJsDatabase,
  tableName: string,
  jsColumns: string[],
  rows: Array<Record<string, unknown>>,
): void {
  if (rows.length === 0) {
    return;
  }

  const sqlColumns = jsColumns.map(toSnake);
  const placeholders = sqlColumns.map(() => "?").join(", ");
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${tableName} (${sqlColumns.join(", ")}) VALUES (${placeholders})`,
  );

  for (const row of rows) {
    const values = jsColumns.map((col) => {
      let val = row[col];
      const sqlCol = toSnake(col);

      // Handle JSON fields (settings, fields)
      if (
        val !== null &&
        val !== undefined &&
        typeof val === "object" &&
        !(val instanceof Date)
      ) {
        val = JSON.stringify(val);
      }

      // Convert timestamps
      if (TIMESTAMP_COLUMNS.has(sqlCol)) {
        return toSqliteTimestamp(val);
      }

      return val ?? null;
    });

    stmt.bind(values);
    stmt.step();
    stmt.reset();
  }
  stmt.free();
}

/**
 * Apply deletions from a sync response.
 */
function applyDeletions(
  db: SqlJsDatabase,
  deletions: Array<{ tableName: string; rowId: string }>,
): void {
  for (const { tableName, rowId } of deletions) {
    // Validate table name to prevent SQL injection
    if (TABLE_COLUMNS[tableName]) {
      db.run(`DELETE FROM ${toSnake(tableName)} WHERE id = ?`, [rowId]);
    }
  }
}

/** Map from sync response key to [tableName, jsColumns]. */
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

/**
 * Apply a sync pull response to the local database.
 */
export function applySyncData(
  db: SqlJsDatabase,
  data: SyncPullResponse,
  isFull: boolean,
): void {
  db.run("BEGIN TRANSACTION");
  try {
    // For a full sync, clear all tables first
    if (isFull) {
      for (const [, tableName] of SYNC_TABLE_MAP) {
        db.run(`DELETE FROM ${tableName}`);
      }
    }

    // Upsert data in dependency order
    for (const [key, tableName, jsColumns] of SYNC_TABLE_MAP) {
      const rows = data[key] as Array<Record<string, unknown>>;
      if (rows && rows.length > 0) {
        upsertRows(db, tableName, jsColumns, rows);
      }
    }

    // Apply deletions (for delta sync)
    if (data.deletions.length > 0) {
      applyDeletions(db, data.deletions);
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

/**
 * Perform a sync pull from the server.
 */
export async function syncPull(handle: LocalDbHandle): Promise<boolean> {
  const lastSync = handle.getLastSyncTime();
  const url = lastSync ? `/api/sync/pull?since=${lastSync}` : "/api/sync/pull";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sync pull failed: ${res.status}`);
  }

  const data = (await res.json()) as SyncPullResponse;
  const isFull = !lastSync;

  applySyncData(handle.db, data, isFull);
  handle.setLastSyncTime(data.syncedAt);
  await handle.persist();

  return true;
}

/**
 * Drain the mutation queue by replaying queued mutations to the server.
 * Failed mutations are discarded (server wins).
 */
export async function syncPush(queue: MutationQueueHandle): Promise<void> {
  const entries = await queue.getAll();

  for (const entry of entries) {
    try {
      const res = await fetch(entry.endpoint, {
        method: entry.method,
        headers: entry.body
          ? { "Content-Type": "application/json" }
          : undefined,
        body: entry.body ? JSON.stringify(entry.body) : undefined,
      });

      if (res.ok || res.status === 400 || res.status === 404) {
        // Success or permanent failure — remove from queue
        await queue.remove(entry.id);
      }
      // 5xx errors: leave in queue for retry
    } catch {
      // Network error — stop draining, will retry next time
      break;
    }
  }
}
