/// <reference types="bun-types" />
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@swanki/core/db/schema";

export function createBunDb(path: string) {
  const sqlite = new Database(path);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  return { drizzleDb: drizzle(sqlite, { schema }), rawDb: sqlite };
}

const envVars = process.env as Record<string, string | undefined>;
const { drizzleDb, rawDb } = createBunDb(
  envVars.DATABASE_URL ?? "data/sqlite.db",
);

export const db = drizzleDb;
export const rawSqlite = rawDb;
