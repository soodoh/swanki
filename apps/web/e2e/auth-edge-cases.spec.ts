import { test, expect } from "@playwright/test";

test.describe("Auth edge cases", () => {
  test.describe.configure({ mode: "serial" });

  // -------------------------------------------------------------------------
  // Tests 1-3: unauthenticated contexts (fresh browser contexts, no storage state)
  // Use the `browser` fixture and create a new context without storage state.
  // -------------------------------------------------------------------------

  test("unauthenticated access redirects to login", async ({ browser }) => {
    // Create a fresh context with no cookies/storage (override the global storageState)
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto("http://localhost:3000/browse");
    // The server issues a 307 redirect to /login for unauthenticated requests.
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    await context.close();
  });

  test("login with wrong password shows error", async ({ browser }) => {
    // Create a fresh context with no cookies/storage
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto("http://localhost:3000/login", {
      waitUntil: "networkidle",
    });
    await page.locator("#email").fill("e2e@test.com");
    await page.locator("#password").fill("WrongPassword123!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/invalid|incorrect|wrong|failed/i)).toBeVisible(
      { timeout: 10_000 },
    );

    await context.close();
  });

  test("register with duplicate email shows error", async ({ browser }) => {
    // Create a fresh context with no cookies/storage
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto("http://localhost:3000/register", {
      waitUntil: "networkidle",
    });
    await page.locator("#name").fill("Duplicate User");
    await page.locator("#email").fill("e2e@test.com");
    await page.locator("#password").fill("TestPass123!");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(/already|exists|taken/i)).toBeVisible({
      timeout: 10_000,
    });

    await context.close();
  });

  // -------------------------------------------------------------------------
  // Tests 4-5: authenticated context (default page fixture with storage state)
  // -------------------------------------------------------------------------

  test("delete account modal requires exact DELETE text", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "networkidle" });

    // Open the delete account dialog
    await page.getByRole("button", { name: "Delete Account" }).click();

    // Dialog should be open; the confirm button should be disabled
    const deleteBtn = page.getByRole("button", {
      name: "Permanently Delete Account",
    });
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await expect(deleteBtn).toBeDisabled();

    // Type lowercase "delete" — should still be disabled
    await page.locator("#confirm-delete").fill("delete");
    await expect(deleteBtn).toBeDisabled();

    // Clear and type exact "DELETE" — should now be enabled
    await page.locator("#confirm-delete").clear();
    await page.locator("#confirm-delete").fill("DELETE");
    await expect(deleteBtn).toBeEnabled();

    // Close without deleting
    await page.keyboard.press("Escape");
  });

  test("sign out redirects to login (LAST TEST)", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Sign Out" }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
