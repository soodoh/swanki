import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		projects: [
			{
				plugins: [tsconfigPaths()],
				test: {
					name: "unit",
					environment: "node",
					include: ["src/**/*.test.ts"],
					globals: true,
				},
			},
			{
				plugins: [tsconfigPaths()],
				test: {
					name: "browser",
					include: ["src/**/*.test.tsx"],
					exclude: ["e2e/**"],
					browser: {
						enabled: true,
						headless: true,
						connectTimeout: 120000,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
});
