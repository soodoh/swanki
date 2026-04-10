import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	for (const key of Object.keys(env)) {
		process.env[key] ??= env[key];
	}
	return {
		resolve: {
			tsconfigPaths: true,
		},
		server: {
			port: 3000,
			watch: { ignored: ["**/data/**"] },
		},
		plugins: [
			tailwindcss(),
			tanstackStart(),
			nitro({ preset: "bun" }),
			viteReact(),
		],
	};
});
