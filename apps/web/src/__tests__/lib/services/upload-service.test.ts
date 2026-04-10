import type { AppFileSystem } from "@swanki/core/filesystem";
import {
	cleanupExpired,
	deleteUpload,
	getUploadPath,
	saveUpload,
} from "@swanki/core/services/upload-service";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeFileSystem implements AppFileSystem {
	private directories = new Set<string>();
	private files = new Map<string, Uint8Array>();
	private mtimes = new Map<string, number>();
	private statFailures = new Set<string>();
	mkdirCalls: string[] = [];
	writeCalls: Array<{ path: string; data: Uint8Array }> = [];
	unlinkCalls: string[] = [];
	rmdirCalls: string[] = [];

	constructor(initialDirectories: string[] = []) {
		for (const dir of initialDirectories) {
			this.directories.add(dir);
		}
	}

	join(...paths: string[]): string {
		const normalized = paths
			.filter(Boolean)
			.map((segment, index) => {
				if (index === 0) {
					return segment.replace(/\/+$/g, "") || "/";
				}
				return segment.replace(/^\/+|\/+$/g, "");
			})
			.filter((segment) => segment.length > 0);
		return normalized.join("/");
	}

	exists(path: string): boolean {
		return this.directories.has(path) || this.files.has(path);
	}

	mkdir(path: string): void {
		this.mkdirCalls.push(path);
		this.directories.add(path);
	}

	writeFile(path: string, data: Uint8Array): void {
		this.writeCalls.push({ path, data });
		this.files.set(path, data);
		this.mtimes.set(path, Date.now());
	}

	readDir(path: string): string[] {
		const prefix = `${path}/`;
		const names = new Set<string>();

		for (const filePath of this.files.keys()) {
			if (filePath.startsWith(prefix)) {
				const remainder = filePath.slice(prefix.length);
				if (!remainder.includes("/")) {
					names.add(remainder);
				}
			}
		}

		return [...names];
	}

	stat(path: string): { mtimeMs: number } {
		if (this.statFailures.has(path)) {
			throw new Error(`stat failed for ${path}`);
		}

		const mtimeMs = this.mtimes.get(path);
		if (mtimeMs === undefined) {
			throw new Error(`missing stat for ${path}`);
		}

		return { mtimeMs };
	}

	unlink(path: string): void {
		this.unlinkCalls.push(path);
		if (!this.files.delete(path)) {
			throw new Error(`missing file ${path}`);
		}
		this.mtimes.delete(path);
	}

	rmdir(path: string): void {
		this.rmdirCalls.push(path);
		this.directories.delete(path);
	}

	addFile(path: string, data: Uint8Array, mtimeMs: number): void {
		this.files.set(path, data);
		this.mtimes.set(path, mtimeMs);
	}

	failStat(path: string): void {
		this.statFailures.add(path);
	}

	hasFile(path: string): boolean {
		return this.files.has(path);
	}

	hasDir(path: string): boolean {
		return this.directories.has(path);
	}
}

async function flushMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		await Promise.resolve();
	}
}

describe("upload-service", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("saveUpload creates the user directory, writes the file, and schedules cleanup", async () => {
		const now = new Date("2026-04-10T18:00:00.000Z").getTime();
		const fs = new FakeFileSystem(["/uploads"]);
		const userDir = "/uploads/user-1";
		const expiredPath = `${userDir}/expired.apkg`;

		fs.addFile(expiredPath, new Uint8Array([9, 9, 9]), now - 60 * 60 * 1000 - 1);

		vi.spyOn(Date, "now").mockReturnValue(now);
		vi.spyOn(crypto, "randomUUID").mockReturnValue("fixed-upload-id");

		const file = new File([new Uint8Array([1, 2, 3])], "Deck.APkg");

		const result = await saveUpload(fs, "/uploads", "user-1", file);

		expect(result).toEqual({
			fileId: "fixed-upload-id",
			filePath: "/uploads/user-1/fixed-upload-id.apkg",
			format: "apkg",
		});
		expect(fs.mkdirCalls).toContain(userDir);
		expect(fs.writeCalls).toEqual([
			{
				path: "/uploads/user-1/fixed-upload-id.apkg",
				data: new Uint8Array([1, 2, 3]),
			},
		]);

		await flushMicrotasks();

		expect(fs.hasFile(expiredPath)).toBe(false);
		expect(fs.hasFile("/uploads/user-1/fixed-upload-id.apkg")).toBe(true);
	});

	it("getUploadPath returns undefined when the user directory is missing", async () => {
		const fs = new FakeFileSystem(["/uploads"]);

		await expect(getUploadPath(fs, "/uploads", "user-1", "missing")).resolves.toBe(
			undefined,
		);
	});

	it("getUploadPath returns undefined when no matching upload exists", async () => {
		const fs = new FakeFileSystem(["/uploads", "/uploads/user-1"]);
		fs.addFile("/uploads/user-1/other-id.apkg", new Uint8Array([1]), 10);

		await expect(getUploadPath(fs, "/uploads", "user-1", "missing")).resolves.toBe(
			undefined,
		);
	});

	it("getUploadPath resolves the stored file path when the file id matches", async () => {
		const fs = new FakeFileSystem(["/uploads", "/uploads/user-1"]);
		fs.addFile("/uploads/user-1/file-123.colpkg", new Uint8Array([1]), 10);

		await expect(
			getUploadPath(fs, "/uploads", "user-1", "file-123"),
		).resolves.toBe("/uploads/user-1/file-123.colpkg");
	});

	it("deleteUpload removes an existing upload", async () => {
		const fs = new FakeFileSystem(["/uploads", "/uploads/user-1"]);
		const filePath = "/uploads/user-1/file-123.colpkg";
		fs.addFile(filePath, new Uint8Array([1]), 10);

		await deleteUpload(fs, "/uploads", "user-1", "file-123");

		expect(fs.hasFile(filePath)).toBe(false);
		expect(fs.unlinkCalls).toEqual([filePath]);
	});

	it("deleteUpload ignores files that disappear before unlink", async () => {
		const fs = new FakeFileSystem(["/uploads", "/uploads/user-1"]);
		const filePath = "/uploads/user-1/file-123.colpkg";
		fs.addFile(filePath, new Uint8Array([1]), 10);
		fs.unlink = vi.fn(() => {
			throw new Error("already deleted");
		});

		await expect(
			deleteUpload(fs, "/uploads", "user-1", "file-123"),
		).resolves.toBeUndefined();
	});

	it("cleanupExpired removes stale files, preserves fresh files, and skips stat failures", async () => {
		const now = new Date("2026-04-10T18:00:00.000Z").getTime();
		const fs = new FakeFileSystem(["/uploads", "/uploads/user-1"]);
		const stalePath = "/uploads/user-1/old.apkg";
		const freshPath = "/uploads/user-1/new.apkg";
		const brokenPath = "/uploads/user-1/broken.apkg";

		fs.addFile(stalePath, new Uint8Array([1]), now - 60 * 60 * 1000 - 1);
		fs.addFile(freshPath, new Uint8Array([2]), now - 60 * 1000);
		fs.addFile(brokenPath, new Uint8Array([3]), now - 60 * 60 * 1000 - 1);
		fs.failStat(brokenPath);

		vi.spyOn(Date, "now").mockReturnValue(now);

		await cleanupExpired(fs, "/uploads", "user-1");

		expect(fs.hasFile(stalePath)).toBe(false);
		expect(fs.hasFile(freshPath)).toBe(true);
		expect(fs.hasFile(brokenPath)).toBe(true);
		expect(fs.rmdirCalls).toEqual([]);
	});

	it("cleanupExpired removes the user directory after deleting the last stale file", async () => {
		const now = new Date("2026-04-10T18:00:00.000Z").getTime();
		const fs = new FakeFileSystem(["/uploads", "/uploads/user-1"]);
		const stalePath = "/uploads/user-1/old.apkg";

		fs.addFile(stalePath, new Uint8Array([1]), now - 60 * 60 * 1000 - 1);

		vi.spyOn(Date, "now").mockReturnValue(now);

		await cleanupExpired(fs, "/uploads", "user-1");

		expect(fs.hasFile(stalePath)).toBe(false);
		expect(fs.rmdirCalls).toEqual(["/uploads/user-1"]);
		expect(fs.hasDir("/uploads/user-1")).toBe(false);
	});
});
