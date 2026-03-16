import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { join } from "node:path";
import type { AppFileSystem } from "./filesystem";

/**
 * Node.js implementation of AppFileSystem.
 * Used by web server and Electron desktop.
 */
export const nodeFs: AppFileSystem = {
  join(...paths: string[]): string {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-return), typescript-eslint(no-unsafe-call) -- node:path is untyped in this project
    return join(...paths);
  },
  exists(path: string): boolean {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-return), typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    return existsSync(path);
  },
  mkdir(path: string, options?: { recursive?: boolean }): void {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    mkdirSync(path, options);
  },
  writeFile(path: string, data: Uint8Array): void {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    writeFileSync(path, data);
  },
  readDir(path: string): string[] {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-return), typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    return readdirSync(path);
  },
  stat(path: string): { mtimeMs: number } {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-return), typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    return statSync(path);
  },
  unlink(path: string): void {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    unlinkSync(path);
  },
  rmdir(path: string): void {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    rmdirSync(path);
  },
};
