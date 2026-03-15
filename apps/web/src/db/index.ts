import { createDb } from "@swanki/core/db";

const envVars = process.env as Record<string, string | undefined>;
const { drizzleDb, rawDb } = createDb(envVars.DATABASE_URL ?? "data/sqlite.db");

export const db = drizzleDb;
export const rawSqlite = rawDb;
