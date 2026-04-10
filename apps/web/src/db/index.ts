/// <reference types="bun-types" />
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import * as schema from "@swanki/core/db/schema";
import { drizzle } from "drizzle-orm/bun-sqlite";

export function createBunDb(path: string): {
	drizzleDb: ReturnType<typeof drizzle>;
	rawDb: Database;
} {
	if (path !== ":memory:" && !path.startsWith("file:")) {
		mkdirSync(dirname(path), { recursive: true });
	}
	const sqlite = new Database(path);
	sqlite.run("PRAGMA journal_mode = WAL");
	sqlite.run("PRAGMA foreign_keys = ON");
	return { drizzleDb: drizzle(sqlite, { schema }), rawDb: sqlite };
}

const envVars = process.env as Record<string, string | undefined>;
const { drizzleDb, rawDb } = createBunDb(
	envVars.DATABASE_URL ?? "data/sqlite.db",
);

export const db = drizzleDb;
export const rawSqlite = rawDb;
