import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings", { waitUntil: "networkidle" });
  });

  // ---------------------------------------------------------------------------
  // Profile section
  // ---------------------------------------------------------------------------

  test("profile section loads with user data", async ({ page }) => {
    const displayName = page.locator("#display-name");
    await expect(displayName).toBeVisible();
    const value = await displayName.inputValue();
    expect(value.length).toBeGreaterThan(0);

    const email = page.locator("#email");
    await expect(email).toBeDisabled();

    await expect(page.getByText("Email cannot be changed.")).toBeVisible();
  });

  test("update display name", async ({ page }) => {
    // Update to new name
    await page.locator("#display-name").clear();
    await page.locator("#display-name").fill("E2E Updated Name");
    await page
      .getByRole("button", { name: /^Save$/ })
      .first()
      .click();
    await expect(page.getByText("Saved").first()).toBeVisible();

    // Reload so the component re-initializes with the new name as baseline,
    // then restore to the original name.
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("#display-name").clear();
    await page.locator("#display-name").fill("E2E Test");
    await page
      .getByRole("button", { name: /^Save$/ })
      .first()
      .click();
    await expect(page.getByText("Saved").first()).toBeVisible();
  });

  test("save button disabled when name unchanged", async ({ page }) => {
    const saveBtn = page.getByRole("button", { name: /^Save$/ }).first();
    await expect(saveBtn).toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // Appearance / Theme section
  // ---------------------------------------------------------------------------

  test("theme: dark mode applies", async ({ page }) => {
    await page.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("theme: light mode applies", async ({ page }) => {
    // First switch to dark so we can verify the transition back
    await page.getByText("Dark", { exact: true }).click();
    await page.getByText("Light", { exact: true }).click();
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass ?? "").not.toMatch(/\bdark\b/);
  });

  test("theme: system mode selectable", async ({ page }) => {
    await page.getByText("System", { exact: true }).click();
    await expect(
      page.locator("label").filter({ hasText: /^System/ }),
    ).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Change Password section
  // ---------------------------------------------------------------------------

  test("change password: too short", async ({ page }) => {
    await page.locator("#current-password").fill("TestPass123!");
    await page.locator("#new-password").fill("short");
    await page.locator("#confirm-password").fill("short");
    await page.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });

  test("change password: mismatch", async ({ page }) => {
    await page.locator("#current-password").fill("TestPass123!");
    await page.locator("#new-password").fill("NewPass456!");
    await page.locator("#confirm-password").fill("DifferentPass789!");
    await page.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByText(/do not match/i)).toBeVisible();
  });

  test("change password: success and restore", async ({ page }) => {
    // Change to new password
    await page.locator("#current-password").fill("TestPass123!");
    await page.locator("#new-password").fill("NewE2EPass456!");
    await page.locator("#confirm-password").fill("NewE2EPass456!");
    await page.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByText(/password changed successfully/i)).toBeVisible({
      timeout: 10_000,
    });

    // Change back to original password
    await page.locator("#current-password").fill("NewE2EPass456!");
    await page.locator("#new-password").fill("TestPass123!");
    await page.locator("#confirm-password").fill("TestPass123!");
    await page.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByText(/password changed successfully/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
