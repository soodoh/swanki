import { createDb } from "@swanki/core/db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export function createTestDb() {
  const { drizzleDb } = createDb(":memory:");
  migrate(drizzleDb, { migrationsFolder: "./drizzle" });
  return drizzleDb;
}
