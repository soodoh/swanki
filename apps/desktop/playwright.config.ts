import { defineConfig } from "@playwright/test";
import { RENDERER_PORT } from "./e2e/global-setup";

export default defineConfig({
	testDir: "./e2e",
	timeout: 120_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	globalSetup: "./e2e/global-setup.ts",
	use: {
		// Relative page.goto() calls (e.g. "/import") resolve against this base
		baseURL: `http://localhost:${RENDERER_PORT}`,
		trace: "on-first-retry",
	},
});
