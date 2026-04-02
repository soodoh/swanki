import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AppFileSystem } from "./filesystem";

/**
 * Node.js implementation of AppFileSystem.
 * Used by web server and Electron desktop.
 */
export const nodeFs: AppFileSystem = {
	join(...paths: string[]): string {
		return join(...paths);
	},
	exists(path: string): boolean {
		return existsSync(path);
	},
	mkdir(path: string, options?: { recursive?: boolean }): void {
		mkdirSync(path, options);
	},
	writeFile(path: string, data: Uint8Array): void {
		writeFileSync(path, data);
	},
	readDir(path: string): string[] {
		return readdirSync(path);
	},
	stat(path: string): { mtimeMs: number } {
		return statSync(path);
	},
	unlink(path: string): void {
		unlinkSync(path);
	},
	rmdir(path: string): void {
		rmdirSync(path);
	},
};
