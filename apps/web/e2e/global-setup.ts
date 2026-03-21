import { chromium } from "@playwright/test";
import type { FullConfig } from "@playwright/test";
import {
  existsSync as _existsSync,
  unlinkSync as _unlinkSync,
  rmSync as _rmSync,
  mkdirSync as _mkdirSync,
} from "node:fs";
import { join as _join } from "node:path";
import { execSync as _execSync } from "node:child_process";

const join = _join as (...args: string[]) => string;
const existsSync = _existsSync as (path: string) => boolean;
const unlinkSync = _unlinkSync as (path: string) => void;
const rmSync = _rmSync as (
  path: string,
  options?: { recursive?: boolean; force?: boolean },
) => void;
const mkdirSync = _mkdirSync as (
  path: string,
  options?: { recursive?: boolean },
) => void;
const execSync = _execSync as (
  command: string,
  options?: { cwd?: string; env?: Record<string, string>; stdio?: string },
) => void;

const dirname = import.meta.dirname;
const WEB_DIR = join(dirname, "..");
const E2E_DB = join(WEB_DIR, "sqlite-e2e.db");
const MEDIA_DIR = join(WEB_DIR, "data", "media");
const AUTH_DIR = join(dirname, ".auth");

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Clean state
  for (const f of [E2E_DB, `${E2E_DB}-wal`, `${E2E_DB}-shm`]) {
    if (existsSync(f)) {
      unlinkSync(f);
    }
  }
  if (existsSync(MEDIA_DIR)) {
    rmSync(MEDIA_DIR, { recursive: true, force: true });
  }

  // Apply migrations to the e2e database using Bun's native SQLite
  // (drizzle-kit push doesn't work because better-sqlite3 is compiled for Bun, not Node)
  execSync("bun --bun run e2e/setup-db.ts sqlite-e2e.db", {
    cwd: WEB_DIR,
    stdio: "pipe",
  });

  // Ensure auth dir exists
  mkdirSync(AUTH_DIR, { recursive: true });

  // Register test user via browser
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:3000/register", {
    waitUntil: "networkidle",
  });

  await page.getByLabel("Name").fill("E2E Test");
  await page.getByLabel("Email").fill("e2e@test.com");
  await page.getByLabel("Password").fill("TestPass123!");

  // Listen for navigation after clicking
  const navigationPromise = page.waitForURL((url) => url.pathname === "/", {
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Create account" }).click();

  // Check for registration errors
  const errorEl = page.locator(String.raw`.bg-destructive\/10`);
  const hasError = await errorEl
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (hasError) {
    const errorText = await errorEl.textContent();
    // If user already exists, try logging in instead
    if (errorText?.includes("already")) {
      await page.goto("http://localhost:3000/login", {
        waitUntil: "networkidle",
      });
      await page.getByLabel("Email").fill("e2e@test.com");
      await page.getByLabel("Password").fill("TestPass123!");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
    } else {
      throw new Error(`Registration failed: ${errorText}`);
    }
  } else {
    await navigationPromise;
  }

  // Save storage state
  await context.storageState({ path: join(AUTH_DIR, "storage-state.json") });

  // Extract user ID from session for seeding
  const sessionRes = await page.request.get(
    "http://localhost:3000/api/auth/get-session",
  );
  const sessionData = (await sessionRes.json()) as {
    user?: { id: string };
  };
  const userId = sessionData.user?.id;
  if (!userId) {
    throw new Error("Failed to get user ID from session for seeding");
  }

  // Seed baseline test data via bun subprocess (bun:sqlite is Bun-only; not available in Node.js)
  execSync(`bun --bun run e2e/seed.ts "${E2E_DB}" "${userId}"`, {
    cwd: WEB_DIR,
    stdio: "pipe",
  });

  await browser.close();
}
