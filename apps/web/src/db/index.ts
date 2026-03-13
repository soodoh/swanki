import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

// oxlint-disable-next-line typescript-eslint(no-unsafe-member-access) -- process.env typed as any in Bun
const envVars = process.env as Record<string, string | undefined>;
// oxlint-disable-next-line typescript-eslint(no-unsafe-assignment),typescript-eslint(no-unsafe-call) -- bun:sqlite Database constructor typed as any
const sqlite = new Database(envVars.DATABASE_URL ?? "data/sqlite.db");
export const sqliteTyped = sqlite as unknown as { exec(sql: string): void };
sqliteTyped.exec("PRAGMA journal_mode = WAL;");
sqliteTyped.exec("PRAGMA foreign_keys = ON;");

// oxlint-disable-next-line typescript-eslint(no-unsafe-argument) -- sqlite typed as any from bun:sqlite
export const db = drizzle(sqlite, { schema });
