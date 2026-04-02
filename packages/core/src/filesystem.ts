/**
 * Platform-agnostic filesystem interface.
 *
 * Node.js (web server / desktop) uses `NodeFileSystem` wrapping `node:fs`.
 * Mobile uses `CapacitorFileSystem` wrapping `@capacitor/filesystem`.
 *
 * All methods return `void | Promise<void>` (or their respective return types)
 * so callers must always `await` them.
 */
export interface AppFileSystem {
	join(...paths: string[]): string;
	exists(path: string): boolean | Promise<boolean>;
	mkdir(path: string, options?: { recursive?: boolean }): void | Promise<void>;
	writeFile(path: string, data: Uint8Array): void | Promise<void>;
	readDir(path: string): string[] | Promise<string[]>;
	stat(path: string): { mtimeMs: number } | Promise<{ mtimeMs: number }>;
	unlink(path: string): void | Promise<void>;
	rmdir(path: string): void | Promise<void>;
}
