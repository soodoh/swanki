import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import type { AppDb, RawSqliteDb } from "@swanki/core/db";

// Note: The actual Drizzle adapter for Capacitor SQLite would be
// @capawesome/capacitor-sqlite-drizzle. This file provides the
// initialization pattern; the exact adapter import will depend on
// which Capacitor SQLite plugin is used.

const sqlite = new SQLiteConnection(CapacitorSQLite);
const DB_NAME = "swanki";

/**
 * Initialize the mobile SQLite database.
 *
 * Returns a Drizzle-compatible database instance and a raw SQLite handle
 * for transaction control.
 */
export async function initMobileDb(): Promise<{
  db: AppDb;
  rawDb: RawSqliteDb;
}> {
  // Check connection consistency
  const isConn = (await sqlite.checkConnectionsConsistency()).result;
  const isDatabase = (await sqlite.isDatabase(DB_NAME)).result;

  if (isConn && isDatabase) {
    const dbConn = await sqlite.retrieveConnection(DB_NAME, false);
    await dbConn.open();

    // TODO: Initialize Drizzle adapter here once @capawesome/capacitor-sqlite-drizzle
    // or equivalent adapter is integrated:
    //
    // import { drizzle } from "@capawesome/capacitor-sqlite-drizzle";
    // import * as schema from "@swanki/core/db/schema";
    // const db = drizzle(CapacitorSQLite, { databaseId: DB_NAME, schema });

    const rawDb: RawSqliteDb = {
      async execSQL(sql: string): Promise<void> {
        await dbConn.execute(sql);
      },
    };

    // Placeholder: return the raw db handle. The Drizzle instance will be
    // created once the adapter is integrated.
    return {
      db: null as unknown as AppDb, // TODO: replace with drizzle(...)
      rawDb,
    };
  }

  // Create new database
  const dbConn = await sqlite.createConnection(
    DB_NAME,
    false,
    "no-encryption",
    1,
    false,
  );
  await dbConn.open();

  // Set WAL mode and foreign keys
  await dbConn.execute("PRAGMA journal_mode = WAL");
  await dbConn.execute("PRAGMA foreign_keys = ON");

  const rawDb: RawSqliteDb = {
    async execSQL(sql: string): Promise<void> {
      await dbConn.execute(sql);
    },
  };

  // TODO: Apply migrations from shared drizzle folder
  // TODO: Initialize Drizzle adapter

  return {
    db: null as unknown as AppDb, // TODO: replace with drizzle(...)
    rawDb,
  };
}
