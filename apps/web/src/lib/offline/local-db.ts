/**
 * Local SQL.js database manager with IndexedDB persistence.
 * Each user gets their own database, keyed by userId.
 */
import { getSqlJs } from "./sql-js-init";
import type { SqlJsDatabase } from "./sql-js-init";
import { LOCAL_SCHEMA_DDL, SCHEMA_VERSION } from "./local-schema";
import { createLocalDrizzle } from "./local-drizzle";
import type { LocalDrizzleDb } from "./local-drizzle";

const IDB_DB_NAME = "swanki-offline";
const IDB_STORE_NAME = "databases";
const IDB_VERSION = 1;

function idbKey(userId: string): string {
  return `db-${userId}`;
}

/** Open the IndexedDB for storing database blobs. */
async function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Load a database blob from IndexedDB. */
async function loadFromIdb(userId: string): Promise<Uint8Array | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE_NAME, "readonly");
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.get(idbKey(userId));
    request.onsuccess = () => resolve(request.result as Uint8Array | null);
    request.onerror = () => reject(request.error);
  });
}

/** Save a database blob to IndexedDB. */
async function saveToIdb(userId: string, data: Uint8Array): Promise<void> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.put(data, idbKey(userId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Delete a database blob from IndexedDB. */
async function deleteFromIdb(userId: string): Promise<void> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.delete(idbKey(userId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Check if the schema version matches; returns false if we need to recreate. */
function checkSchemaVersion(db: SqlJsDatabase): boolean {
  try {
    const stmt = db.prepare(
      "SELECT value FROM _meta WHERE key = 'schema_version'",
    );
    if (stmt.step()) {
      const row = stmt.getAsObject() as { value: string };
      stmt.free();
      return Number(row.value) === SCHEMA_VERSION;
    }
    stmt.free();
    return false;
  } catch {
    return false;
  }
}

/** Apply schema and set version. */
function initializeSchema(db: SqlJsDatabase): void {
  db.run(LOCAL_SCHEMA_DDL);
  db.run(
    `INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', '${SCHEMA_VERSION}')`,
  );
}

export type LocalDbHandle = {
  /** Raw SQL.js database — used for sync engine bulk ops and export/persist. */
  db: SqlJsDatabase;
  /** Drizzle-wrapped database — used for typed queries and mutations. */
  drizzleDb: LocalDrizzleDb;
  userId: string;
  /** Persist the current DB state to IndexedDB. */
  persist: () => Promise<void>;
  /** Close the DB and clean up. */
  close: () => void;
  /** Check if the DB has been synced at least once. */
  hasSynced: () => boolean;
  /** Get the last sync timestamp (ms since epoch). */
  getLastSyncTime: () => number | null;
  /** Set the last sync timestamp. */
  setLastSyncTime: (timestamp: number) => void;
};

/**
 * Open or create the local database for a user.
 * If a persisted DB exists in IDB but has a stale schema version,
 * it's dropped and a fresh one is created (data will be re-synced).
 */
export async function openLocalDb(userId: string): Promise<LocalDbHandle> {
  const SQL = await getSqlJs();

  // Try loading from IndexedDB
  const saved = await loadFromIdb(userId);
  let db: SqlJsDatabase;

  if (saved) {
    db = new SQL.Database(saved);
    if (!checkSchemaVersion(db)) {
      // Schema mismatch — drop and recreate
      db.close();
      await deleteFromIdb(userId);
      db = new SQL.Database();
      initializeSchema(db);
    }
  } else {
    db = new SQL.Database();
    initializeSchema(db);
  }

  const persist = async () => {
    const data = db.export();
    await saveToIdb(userId, data);
  };

  const close = () => {
    db.close();
  };

  const hasSynced = (): boolean => {
    try {
      const stmt = db.prepare(
        "SELECT value FROM _sync_state WHERE key = 'last_sync_time'",
      );
      const has = stmt.step();
      stmt.free();
      return has;
    } catch {
      return false;
    }
  };

  const getLastSyncTime = (): number | null => {
    try {
      const stmt = db.prepare(
        "SELECT value FROM _sync_state WHERE key = 'last_sync_time'",
      );
      if (stmt.step()) {
        const row = stmt.getAsObject() as { value: string };
        stmt.free();
        return Number(row.value);
      }
      stmt.free();
      return null;
    } catch {
      return null;
    }
  };

  const setLastSyncTime = (timestamp: number): void => {
    db.run(
      "INSERT OR REPLACE INTO _sync_state (key, value) VALUES ('last_sync_time', ?)",
      [String(timestamp)],
    );
  };

  const drizzleDb = createLocalDrizzle(db);

  return {
    db,
    drizzleDb,
    userId,
    persist,
    close,
    hasSynced,
    getLastSyncTime,
    setLastSyncTime,
  };
}

/** Delete all local data for a user. */
export async function clearLocalDb(userId: string): Promise<void> {
  await deleteFromIdb(userId);
}
