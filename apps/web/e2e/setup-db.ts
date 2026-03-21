/// <reference types="bun-types" />
import { createBunDb } from "../src/db";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const dbPath = process.argv[2] || "sqlite-e2e.db";
const { drizzleDb } = createBunDb(dbPath);
migrate(drizzleDb, { migrationsFolder: "./drizzle" });
