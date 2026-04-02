import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const nodeExternals = [
	"electron",
	...builtinModules.flatMap((m) => [m, `node:${m}`]),
];

export default defineConfig({
	define: {
		MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify("http://localhost:5174"),
		MAIN_WINDOW_VITE_NAME: JSON.stringify("main_window"),
		DRIZZLE_MIGRATIONS_PATH: JSON.stringify(
			resolve(__dirname, "../web/drizzle"),
		),
		// Vite replaces process.env with {} at build time (browser polyfill), so
		// process.env.SWANKI_TEST_DATA_DIR never reaches the Electron runtime.
		// Bake the test-data path into the binary directly instead.
		"process.env.SWANKI_TEST_DATA_DIR": JSON.stringify(
			resolve(__dirname, ".e2e-test-data"),
		),
		"process.env.SWANKI_CLOUD_URL": "undefined",
		"process.env.PLAYWRIGHT_TEST": JSON.stringify("1"),
	},
	resolve: {
		conditions: ["node"],
		mainFields: ["module", "jsnext:main", "jsnext"],
	},
	build: {
		outDir: ".vite/build",
		emptyOutDir: false,
		rollupOptions: {
			input: resolve(__dirname, "electron/main.ts"),
			external: ["better-sqlite3", ...nodeExternals],
			output: {
				format: "cjs",
				entryFileNames: "[name].cjs",
				inlineDynamicImports: true,
			},
		},
	},
});
