import { test, expect } from "./fixtures";
import { RENDERER_URL } from "./global-setup";

/** Locator for the user dropdown trigger in the sidebar footer. */
const FOOTER_BUTTON =
  '[data-sidebar="footer"] button[data-slot="dropdown-menu-trigger"]';

test.describe.serial("desktop sidebar auth flow", () => {
  test("sidebar shows Sign in when not authenticated", async ({ page }) => {
    await page.goto(`${RENDERER_URL}/`, { waitUntil: "load" });
    await page.waitForSelector('[data-sidebar="sidebar"]', { timeout: 15_000 });

    // Default state: authStatus returns signedIn: false (no cloud session)
    await page.locator(FOOTER_BUTTON).click();

    const signInItem = page.getByRole("menuitem", { name: "Sign in" });
    await expect(signInItem).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("sign-in updates sidebar to show Sign out", async ({
    page,
    electronApp,
  }) => {
    // Mock auth:sign-in IPC handler at the main process level
    // (contextBridge objects are frozen, so we can't mock on window.electronAPI)
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("auth:sign-in");
      ipcMain.handle("auth:sign-in", () => ({ signedIn: true }));
    });

    // Open dropdown and click "Sign in"
    await page.locator(FOOTER_BUTTON).click();
    await page.getByRole("menuitem", { name: "Sign in" }).click();

    // Wait for React state update
    await page.waitForTimeout(500);

    // Re-open dropdown and verify "Sign out" is now visible
    await page.locator(FOOTER_BUTTON).click();
    const signOutItem = page.getByRole("menuitem", { name: "Sign out" });
    await expect(signOutItem).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("sign-out returns to dashboard and shows Sign in", async ({
    page,
    electronApp,
  }) => {
    // Mock auth:sign-out IPC handler
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("auth:sign-out");
      ipcMain.handle("auth:sign-out", () => ({ signedIn: false }));
    });

    // Open dropdown and click "Sign out"
    await page.locator(FOOTER_BUTTON).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    // handleSignOut navigates to "/" via full reload, wait for sidebar
    await page.waitForSelector('[data-sidebar="sidebar"]', { timeout: 15_000 });

    // After reload, useEffect calls authStatus() which returns real state
    // Mock auth:status to return signed-out
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("auth:status");
      ipcMain.handle("auth:status", () => ({ signedIn: false }));
    });

    // Reload so the mocked auth:status takes effect
    await page.goto(`${RENDERER_URL}/`, { waitUntil: "load" });
    await page.waitForSelector('[data-sidebar="sidebar"]', { timeout: 15_000 });

    await page.locator(FOOTER_BUTTON).click();
    const signInItem = page.getByRole("menuitem", { name: "Sign in" });
    await expect(signInItem).toBeVisible();
  });
});
