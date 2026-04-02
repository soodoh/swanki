import type { ChildProcess } from "node:child_process";
import { execSync as _execSync, spawn as _spawn } from "node:child_process";
import {
	existsSync as _existsSync,
	mkdirSync as _mkdirSync,
	readdirSync as _readdirSync,
	rmSync as _rmSync,
} from "node:fs";
import { join as _join, resolve as _resolve } from "node:path";
import type { FullConfig } from "@playwright/test";

// Type-cast node builtins for ESM/CJS compat under Playwright's transformer
const existsSync = _existsSync as (path: string) => boolean;
const rmSync = _rmSync as (
	path: string,
	opts?: { recursive?: boolean; force?: boolean },
) => void;
const mkdirSync = _mkdirSync as (
	path: string,
	opts?: { recursive?: boolean },
) => void;
const readdirSync = _readdirSync as (path: string) => string[];
const join = _join as (...args: string[]) => string;
const resolve = _resolve as (...args: string[]) => string;
const execSync = _execSync as (
	cmd: string,
	opts?: { cwd?: string; stdio?: string },
) => void;
const spawn = _spawn as (
	cmd: string,
	args: string[],
	opts?: { cwd?: string },
) => ChildProcess;

const dirname = import.meta.dirname;
export const DESKTOP_DIR = resolve(dirname, "..");
export const RENDERER_PORT = 5174;
export const RENDERER_URL = `http://localhost:${RENDERER_PORT}`;
export const TEST_DATA_DIR = resolve(DESKTOP_DIR, ".e2e-test-data");
// Vite dep-optimisation cache used by the test renderer config.
// Keeping it separate from node_modules/.vite/ lets global-setup own and clean
// it without touching the regular development cache.
const VITE_TEST_CACHE_DIR = resolve(DESKTOP_DIR, ".e2e-vite-cache");

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (res.status < 500) return;
		} catch {
			// server not ready yet
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error(`Server at ${url} not ready after ${timeoutMs}ms`);
}

export default async function globalSetup(
	_config: FullConfig,
): Promise<() => Promise<void>> {
	// 1. Clean test data directory
	if (existsSync(TEST_DATA_DIR)) {
		rmSync(TEST_DATA_DIR, { recursive: true, force: true });
	}
	mkdirSync(TEST_DATA_DIR, { recursive: true });
	mkdirSync(join(TEST_DATA_DIR, "media"), { recursive: true });

	// 2. Build main process with test defines
	console.log("[e2e] Building main process...");
	execSync(
		"bun x vite build --config vite.main.test.config.ts --logLevel warn",
		{ cwd: DESKTOP_DIR, stdio: "inherit" },
	);

	// 3. Build preload with test config
	console.log("[e2e] Building preload...");
	execSync(
		"bun x vite build --config vite.preload.test.config.ts --logLevel warn",
		{ cwd: DESKTOP_DIR, stdio: "inherit" },
	);

	// 4. Clear the test-specific Vite dep-optimisation cache.
	//
	// vite.renderer.test.config.ts points Vite's cacheDir at .e2e-vite-cache/
	// (separate from the regular node_modules/.vite/ used in development).
	// Deleting it before each run guarantees a fresh optimisation pass, so the
	// startup full-reload HMR event fires before Electron ever connects.
	if (existsSync(VITE_TEST_CACHE_DIR)) {
		rmSync(VITE_TEST_CACHE_DIR, { recursive: true, force: true });
	}

	// 5. Start renderer Vite dev server with the test-specific config.
	console.log(`[e2e] Starting renderer dev server on port ${RENDERER_PORT}...`);
	const rendererProc = spawn(
		"bun",
		[
			"x",
			"vite",
			"--config",
			"vite.renderer.test.config.ts",
			"--port",
			String(RENDERER_PORT),
			"--strictPort",
			"--logLevel",
			"warn",
		],
		{ cwd: DESKTOP_DIR },
	);
	rendererProc.on("error", (err) => {
		console.error("[e2e] Renderer dev server error:", err);
	});

	await waitForServer(`http://localhost:${RENDERER_PORT}`);
	console.log(
		`[e2e] Renderer dev server ready at http://localhost:${RENDERER_PORT}`,
	);

	// 6. Pre-warm Vite and wait for dep optimisation to complete.
	//
	// Fetching the HTML routes triggers Vite's static-import crawl.  After that,
	// we poll until .e2e-vite-cache/deps/ has been created and stabilised
	// (no deps_temp_* sibling present for ≥ 1 s).  Once stable, the startup
	// full-reload has already been sent to no clients — Electron will then
	// connect to a server with no pending reloads.
	console.log("[e2e] Pre-warming Vite dep cache...");
	for (const route of ["/", "/import"]) {
		try {
			await fetch(`http://localhost:${RENDERER_PORT}${route}`);
		} catch {
			// Non-fatal — best effort warm-up
		}
	}

	console.log("[e2e] Waiting for Vite dep optimisation to complete...");
	const viteDepDir = resolve(VITE_TEST_CACHE_DIR, "deps");
	const optimisationDeadline = Date.now() + 120_000;
	let stableSince = 0;
	while (Date.now() < optimisationDeadline) {
		const hasDeps = existsSync(viteDepDir);
		const hasTemp =
			existsSync(VITE_TEST_CACHE_DIR) &&
			readdirSync(VITE_TEST_CACHE_DIR).some((e) => e.startsWith("deps_temp"));
		if (hasDeps && !hasTemp) {
			if (stableSince === 0) stableSince = Date.now();
			if (Date.now() - stableSince >= 1_000) break; // stable for ≥ 1 s
		} else {
			stableSince = 0;
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	console.log("[e2e] Vite ready — connecting Electron.");

	return async () => {
		rendererProc.kill();
	};
}
