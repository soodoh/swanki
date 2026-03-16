/**
 * Ensures better-sqlite3 is compiled for the current Node.js ABI.
 *
 * Electron Forge rebuilds the shared native module for Electron's ABI
 * during `start:desktop`. This script restores it for Node.js so that
 * `dev:web` and tests work correctly.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let pkgDir;
try {
  // Resolve the actual better-sqlite3 directory (follows Bun symlinks)
  const entry = require.resolve("better-sqlite3");
  pkgDir = resolve(entry, "../..");
} catch {
  process.exit(0); // Not installed, nothing to do
}

const forgeMeta = resolve(pkgDir, "build/Release/.forge-meta");
if (!existsSync(forgeMeta)) {
  // No .forge-meta means the module was NOT rebuilt by Electron Forge,
  // so it should already be compatible with the current Node.js.
  process.exit(0);
}

console.log("Rebuilding better-sqlite3 for Node.js...");
const buildDir = resolve(pkgDir, "build");
rmSync(buildDir, { recursive: true, force: true });

try {
  execFileSync("npx", ["--yes", "prebuild-install"], {
    cwd: pkgDir,
    stdio: "ignore",
  });
} catch {
  // prebuild-install failed, fall back to node-gyp
  execFileSync("npx", ["--yes", "node-gyp", "rebuild", "--release"], {
    cwd: pkgDir,
    stdio: "ignore",
  });
}
