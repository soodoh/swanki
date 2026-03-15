import { createDb } from "@swanki/core/db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTestDb() {
  const { drizzleDb, rawDb } = createDb(":memory:");
  migrate(drizzleDb, { migrationsFolder: "./drizzle" });
  return drizzleDb;
}

export function createTestDbWithRaw() {
  const { drizzleDb, rawDb } = createDb(":memory:");
  migrate(drizzleDb, { migrationsFolder: "./drizzle" });
  return { db: drizzleDb, rawDb };
}

export const testMediaDir: string = join(tmpdir(), "swanki-test-media");
export const testUploadDir: string = join(tmpdir(), "swanki-test-uploads");
