import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  define: {
    DRIZZLE_MIGRATIONS_PATH: JSON.stringify(
      resolve(__dirname, "../web/drizzle"),
    ),
  },
  resolve: {
    conditions: ["node"],
    mainFields: ["module", "jsnext:main", "jsnext"],
  },
  build: {
    rollupOptions: {
      external: ["better-sqlite3"],
      output: {
        // Forge plugin forces CJS format for main process.
        // Use .cjs extension so Node treats it as CommonJS
        // even with "type": "module" in package.json.
        entryFileNames: "[name].cjs",
      },
    },
  },
});
