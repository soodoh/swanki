import { createDb } from "@swanki/core/db";
import type { AppDb } from "@swanki/core/db";
import type Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTestDb(): AppDb {
  const { drizzleDb } = createDb(":memory:");
  migrate(drizzleDb, { migrationsFolder: "./drizzle" });
  return drizzleDb;
}

export function createTestDbWithRaw(): { db: AppDb; rawDb: Database.Database } {
  const { drizzleDb, rawDb } = createDb(":memory:");
  migrate(drizzleDb, { migrationsFolder: "./drizzle" });
  return { db: drizzleDb, rawDb };
}

export const testMediaDir: string = join(tmpdir(), "swanki-test-media");
export const testUploadDir: string = join(tmpdir(), "swanki-test-uploads");
