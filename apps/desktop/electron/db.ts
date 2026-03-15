import { app } from "electron";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@swanki/core/db/schema";

const userDataPath = app.getPath("userData");
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
  : join(__dirname, "../../web/drizzle");

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
