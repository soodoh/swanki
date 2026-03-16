import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { AppDb } from "@swanki/core/db";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/db/schema";

function createDbFromPath(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  return { drizzleDb: drizzle(sqlite, { schema }), rawDb: sqlite };
}

export function createTestDb(): AppDb {
  const { drizzleDb } = createDbFromPath(":memory:");
  migrate(drizzleDb, { migrationsFolder: "./drizzle" });
  return drizzleDb;
}

export function createTestDbWithRaw(): { db: AppDb; rawDb: Database } {
  const { drizzleDb, rawDb } = createDbFromPath(":memory:");
  migrate(drizzleDb, { migrationsFolder: "./drizzle" });
  return { db: drizzleDb, rawDb };
}

export const testMediaDir: string = join(tmpdir(), "swanki-test-media");
export const testUploadDir: string = join(tmpdir(), "swanki-test-uploads");
