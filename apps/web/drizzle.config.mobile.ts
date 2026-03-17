/**
 * Drizzle Kit config for mobile migrations.
 *
 * Uses driver: 'expo' to generate a bundled migrations.js file
 * that can be imported and applied at runtime via the Capawesome
 * Capacitor SQLite Drizzle adapter's migrate() function.
 *
 * Uses the same schema as the web/desktop migrations.
 * Run: cd apps/web && bun x drizzle-kit generate --config drizzle.config.mobile.ts
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle-mobile",
  dialect: "sqlite",
  driver: "expo",
});
