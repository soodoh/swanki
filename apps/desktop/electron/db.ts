import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "@swanki/core/db/schema";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { app } from "electron";

declare const DRIZZLE_MIGRATIONS_PATH: string;

const userDataPath =
	process.env.SWANKI_TEST_DATA_DIR ?? app.getPath("userData");
const dbPath = join(userDataPath, "swanki.db");

// Ensure the directory exists
if (!existsSync(userDataPath)) {
	mkdirSync(userDataPath, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export const rawSqlite = sqlite;

// Run migrations
const migrationsFolder = app.isPackaged
	? join(process.resourcesPath, "drizzle")
	: DRIZZLE_MIGRATIONS_PATH;

try {
	migrate(db, { migrationsFolder });
} catch (e) {
	console.error("Migration failed:", e);
}

// Ensure media directory exists
const mediaDir = join(userDataPath, "media");
if (!existsSync(mediaDir)) {
	mkdirSync(mediaDir, { recursive: true });
}

export { mediaDir };
