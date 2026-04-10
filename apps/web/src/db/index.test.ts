import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("createBunDb", () => {
	const originalDatabaseUrl = process.env.DATABASE_URL;

	afterEach(() => {
		process.env.DATABASE_URL = originalDatabaseUrl;
		vi.resetModules();
	});

	it("creates missing parent directories for file-backed sqlite databases", async () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "swanki-db-"));
		const dbPath = join(tempRoot, "nested", "data", "sqlite.db");

		process.env.DATABASE_URL = ":memory:";
		const { createBunDb } = await import("./index");

		const { rawDb } = createBunDb(dbPath);

		expect(existsSync(join(tempRoot, "nested", "data"))).toBe(true);

		rawDb.close();
		rmSync(tempRoot, { recursive: true, force: true });
	});
});
