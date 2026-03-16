import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const envVars = process.env as Record<string, string | undefined>;
const sqlite = new Database(envVars.DATABASE_URL ?? "data/sqlite.db");
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const rawSqlite = sqlite;
export const db = drizzle(sqlite, { schema });
