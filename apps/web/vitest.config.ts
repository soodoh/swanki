import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const browserOptimizeDeps = [
	"@base-ui/react/button",
	"@base-ui/react/avatar",
	"@base-ui/react/checkbox",
	"@base-ui/react/collapsible",
	"@base-ui/react/dialog",
	"@base-ui/react/input",
	"@base-ui/react/menu",
	"@base-ui/react/progress",
	"@base-ui/react/select",
	"@base-ui/react/separator",
	"@base-ui/react/tabs",
	"@base-ui/react/tooltip",
	"@better-auth/electron/proxy",
	"@tanstack/react-router",
	"@codemirror/lang-css",
	"@codemirror/lang-html",
	"@codemirror/theme-one-dark",
	"@dnd-kit/core",
	"@dnd-kit/sortable",
	"@dnd-kit/utilities",
	"@uiw/react-codemirror",
	"better-auth/react",
	"class-variance-authority",
	"embla-carousel-react",
	"isomorphic-dompurify",
	"lucide-react",
	"react",
	"react-dom",
];

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		projects: [
			{
				plugins: [tsconfigPaths()],
				optimizeDeps: {
					include: browserOptimizeDeps,
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
		],
	},
});
