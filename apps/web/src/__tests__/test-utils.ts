import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../db/schema";

export function createTestDb(): BunSQLiteDatabase<typeof schema> {
  // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment),typescript-eslint(no-unsafe-call) -- bun:sqlite Database types are inferred as any
  const sqlite = new Database(":memory:");
  const sqliteTyped = sqlite as unknown as { exec(sql: string): void };
  sqliteTyped.exec("PRAGMA foreign_keys = ON;");
  // oxlint-disable-next-line typescript-eslint(no-unsafe-argument) -- sqlite typed as any from bun:sqlite
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
