/**
 * Vite config for mobile SPA build.
 *
 * Differences from vite.config.ts:
 * - SPA mode enabled (no SSR, no server functions)
 * - VITE_PLATFORM=mobile env var for conditional code paths
 * - No nitro plugin (no server)
 * - Output to dist/ for Capacitor's webDir
 */

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	define: {
		"import.meta.env.VITE_PLATFORM": JSON.stringify("mobile"),
	},
	server: {
		port: 3000,
		cors: {
			origin: "*",
			credentials: true,
		},
	},
	plugins: [
		tailwindcss(),
		tsconfigPaths(),
		tanstackStart({
			spa: {
				enabled: true,
			},
		}),
		viteReact(),
	],
	build: {
		outDir: "dist",
	},
});
