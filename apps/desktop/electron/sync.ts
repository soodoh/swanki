/**
 * Desktop cloud sync engine.
 * Fetches data from the cloud server's /api/sync/pull endpoint and
 * applies it to the local better-sqlite3 database.
 */
import type { AppDb } from "@swanki/core/db";
import type Database from "better-sqlite3";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { getToken, getCloudServerUrl, clearToken } from "./auth";

// ── Sync pull response type (matches server SyncService output) ─────

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

// ── Sync state persistence ──────────────────────────────────────────

const SYNC_STATE_PATH = join(app.getPath("userData"), "sync-state.json");

function getLastSyncTime(): number | null {
  try {
    if (existsSync(SYNC_STATE_PATH)) {
      const data = JSON.parse(readFileSync(SYNC_STATE_PATH, "utf-8"));
      return data.lastSyncTime ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setLastSyncTime(time: number): void {
  writeFileSync(SYNC_STATE_PATH, JSON.stringify({ lastSyncTime: time }));
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

// ── Core sync pull ──────────────────────────────────────────────────

/**
 * Pull data from the cloud server and apply it to the local DB.
 * On first sync (no lastSyncTime) a full pull is performed which
 * replaces all local data. Subsequent calls do a delta pull.
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

      // Upsert rows in dependency order
      for (const [key, tableName, jsColumns] of SYNC_TABLE_MAP) {
        const rows = data[key] as Array<Record<string, unknown>>;
        if (!rows || rows.length === 0) continue;

        const stmt = buildUpsertStmt(rawDb, tableName, jsColumns);
        for (const row of rows) {
          stmt.run(...rowValues(jsColumns, row));
        }
      }

      // Apply deletions (delta sync)
      if (data.deletions.length > 0) {
        for (const { tableName, rowId } of data.deletions) {
          // Validate table name against known tables
          const sqlTable = SYNC_TABLE_MAP.find(([k]) => k === tableName)?.[1];
          if (sqlTable) {
            rawDb.prepare(`DELETE FROM ${sqlTable} WHERE id = ?`).run(rowId);
          }
        }
      }
    });

    applySync();
    setLastSyncTime(data.syncedAt);
    setStatus("idle");
  } catch (e) {
    console.error("Sync error:", e);
    setStatus("error");
  }
}

// ── Periodic sync ───────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startPeriodicSync(db: AppDb, rawDb: Database.Database): void {
  if (syncInterval) return;
  syncInterval = setInterval(() => {
    if (getToken()) {
      void syncPull(db, rawDb);
    }
  }, SYNC_INTERVAL_MS);
}

export function stopPeriodicSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
