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
					setupFiles: ["src/__tests__/unit/setup.ts"],
					globals: true,
				},
			},
			{
				plugins: [tsconfigPaths()],
				optimizeDeps: {
					include: [
						"@base-ui/react/button",
						"@base-ui/react/collapsible",
						"@base-ui/react/dialog",
						"@base-ui/react/input",
						"@base-ui/react/menu",
						"@base-ui/react/tabs",
						"@base-ui/react/tooltip",
						"@codemirror/lang-css",
						"@codemirror/lang-html",
						"@codemirror/theme-one-dark",
						"@dnd-kit/core",
						"@dnd-kit/sortable",
						"@dnd-kit/utilities",
						"class-variance-authority",
						"isomorphic-dompurify",
						"lucide-react",
						"react",
						"react-dom",
						"@uiw/react-codemirror",
					],
				},
				test: {
					name: "browser",
					include: ["src/**/*.test.tsx"],
					exclude: ["e2e/**"],
					setupFiles: ["src/__tests__/browser/setup.ts"],
					browser: {
						enabled: true,
						headless: true,
						fileParallelism: false,
						connectTimeout: 120000,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
});
