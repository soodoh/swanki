import { createRequire } from "node:module";
import {
	_electron,
	test as base,
	type ElectronApplication,
	type Page,
} from "@playwright/test";
import { DESKTOP_DIR, RENDERER_PORT, TEST_DATA_DIR } from "./global-setup";

// createRequire is needed to resolve CJS packages (like `electron`) from ESM
const require = createRequire(import.meta.url);

export type ElectronFixtures = {
	page: Page;
};

export type ElectronWorkerFixtures = {
	electronApp: ElectronApplication;
};

/**
 * Custom test with Electron fixtures:
 * - `electronApp` is worker-scoped: one Electron process for the entire worker.
 *   With workers: 1, this means one process for all tests — DB state persists
 *   across serial tests, matching the web e2e behaviour.
 * - `page` is test-scoped: re-fetches the window reference per test.
 */
export const test = base.extend<ElectronFixtures, ElectronWorkerFixtures>({
	electronApp: [
		async (_fixtures, use) => {
			// Resolve the Electron binary path from the desktop's node_modules
			const executablePath: string = require("electron") as string;

			const app = await _electron.launch({
				executablePath,
				args: [`${DESKTOP_DIR}/.vite/build/main.cjs`],
				env: {
					...(process.env as Record<string, string>),
					SWANKI_TEST_DATA_DIR: TEST_DATA_DIR,
					PLAYWRIGHT_TEST: "1",
					NODE_ENV: "test",
				},
				cwd: DESKTOP_DIR,
				// Set baseURL so that page.goto("/import") resolves correctly
				baseURL: `http://localhost:${RENDERER_PORT}`,
			});

			await use(app);
			await app.close();
		},
		{ scope: "worker" },
	],

	page: async ({ electronApp }, use) => {
		const window = await electronApp.firstWindow();
		// Wait for the renderer to fully load (ensures electronAPI is available)
		await window.waitForLoadState("networkidle", { timeout: 60_000 });
		await use(window);
	},
});

export const expect = base.expect;
