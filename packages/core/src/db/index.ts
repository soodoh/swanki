import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

/** Shared DB type compatible with both bun:sqlite and better-sqlite3 drivers */
export type AppDb = BaseSQLiteDatabase<"sync", unknown, typeof schema>;
