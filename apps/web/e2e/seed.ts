/// <reference types="bun-types" />
// Bun seed script: called by global-setup.ts via execSync.
// Arguments: <dbPath> <userId>
import { seedData } from "./setup-db";

const [, , dbPath, userId] = process.argv;
if (!dbPath || !userId) {
	console.error("Usage: bun run e2e/seed.ts <dbPath> <userId>");
	process.exit(1);
}

seedData(dbPath, userId);
