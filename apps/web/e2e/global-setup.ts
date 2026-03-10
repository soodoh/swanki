import { chromium, type FullConfig } from "@playwright/test";
import { existsSync, unlinkSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const WEB_DIR = join(import.meta.dirname, "..");
const E2E_DB = join(WEB_DIR, "sqlite-e2e.db");
const MEDIA_DIR = join(WEB_DIR, "data", "media");
const AUTH_DIR = join(import.meta.dirname, ".auth");

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Clean state
  for (const f of [E2E_DB, `${E2E_DB}-wal`, `${E2E_DB}-shm`]) {
    if (existsSync(f)) unlinkSync(f);
  }
  if (existsSync(MEDIA_DIR)) {
    rmSync(MEDIA_DIR, { recursive: true, force: true });
  }

  // Push DB schema to the e2e database
  execSync("bun x drizzle-kit push --force", {
    cwd: WEB_DIR,
    env: { ...process.env, DATABASE_URL: "sqlite-e2e.db" },
    stdio: "pipe",
  });
  console.log("Database schema pushed to e2e DB");

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
  const errorEl = page.locator(".bg-destructive\\/10");
  const hasError = await errorEl
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (hasError) {
    const errorText = await errorEl.textContent();
    console.log(`Registration error: ${errorText}`);
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
  await browser.close();
}
