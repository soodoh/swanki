import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const envVars = process.env as Record<string, string | undefined>;
const sqlite = new Database(envVars.DATABASE_URL ?? "data/sqlite.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const rawSqlite = sqlite;
export const db = drizzle(sqlite, { schema });
