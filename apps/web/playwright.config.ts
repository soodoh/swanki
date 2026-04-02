import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	testMatch: [
		"import-and-study.spec.ts",
		"template-preview.spec.ts",
		"stats.spec.ts",
		"browse.spec.ts",
		"deck-management.spec.ts",
		"note-types.spec.ts",
		"study-actions.spec.ts",
		"settings.spec.ts",
		"auth-edge-cases.spec.ts",
	],
	timeout: 120_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	globalSetup: "./e2e/global-setup.ts",
	use: {
		baseURL: "http://localhost:3000",
		storageState: "./e2e/.auth/storage-state.json",
		trace: "on-first-retry",
		...devices["Desktop Chrome"],
	},
	webServer: {
		command: "bun run dev",
		port: 3000,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		env: {
			DATABASE_URL: "sqlite-e2e.db",
			BETTER_AUTH_URL: "http://localhost:3000",
		},
	},
});
