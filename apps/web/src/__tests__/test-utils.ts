/// <reference types="bun-types" />
import type { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDb } from "@swanki/core/db";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createBunDb } from "../db";

export function createTestDb(): AppDb {
	const { drizzleDb } = createBunDb(":memory:");
	migrate(drizzleDb, { migrationsFolder: "./drizzle" });
	return drizzleDb as unknown as AppDb;
}

export function createTestDbWithRaw(): { db: AppDb; rawDb: Database } {
	const { drizzleDb, rawDb } = createBunDb(":memory:");
	migrate(drizzleDb, { migrationsFolder: "./drizzle" });
	return { db: drizzleDb as unknown as AppDb, rawDb };
}

export const testMediaDir: string = join(tmpdir(), "swanki-test-media");
export const testUploadDir: string = join(tmpdir(), "swanki-test-uploads");
