import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

export function createDb(dbPath: string) {
	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	return { drizzleDb: drizzle(sqlite, { schema }), rawDb: sqlite };
}

/**
 * Platform-agnostic database type. Accepts both sync (better-sqlite3, bun:sqlite)
 * and async (Capacitor SQLite, op-sqlite) Drizzle drivers.
 *
 * All service methods must use `await` on Drizzle query calls to support both modes.
 */
// oxlint-disable-next-line typescript-eslint(no-explicit-any) -- intentionally broad to accept any SQLite driver
export type AppDb = BaseSQLiteDatabase<any, any, typeof schema>;

/**
 * Interface for raw SQLite access (transactions).
 * Abstracts over better-sqlite3 (sync) and Capacitor SQLite (async).
 */
export interface RawSqliteDb {
	execSQL(sql: string): void | Promise<void>;
}
