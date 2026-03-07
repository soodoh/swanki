import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of Object.keys(env)) {
    process.env[key] ??= env[key];
  }
  return {
    server: { port: 3000 },
    plugins: [
      tailwindcss(),
      tsconfigPaths(),
      tanstackStart(),
      nitro({ preset: "bun" }),
      viteReact(),
    ],
  };
});
