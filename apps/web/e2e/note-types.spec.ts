import { test, expect } from "@playwright/test";

import { deleteNoteType } from "./helpers/api";

// ---------------------------------------------------------------------------
// Read-only note type tests (parallel-safe, no mutations)
// ---------------------------------------------------------------------------

test.describe("Note types page - read-only", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });
  });

  test("page shows seeded note types", async ({ page }) => {
    // Both seeded note types should be visible
    await expect(page.getByText("E2E Basic")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("E2E Cloze")).toBeVisible({ timeout: 10_000 });

    // Each should show "2 fields" badge
    const basicCard = page
      .locator(".group")
      .filter({ hasText: "E2E Basic" })
      .first();
    await expect(basicCard.getByText("2 fields")).toBeVisible();

    const clozeCard = page
      .locator(".group")
      .filter({ hasText: "E2E Cloze" })
      .first();
    await expect(clozeCard.getByText("2 fields")).toBeVisible();
  });

  test("delete note type with notes fails", async ({ page }) => {
    // Find the E2E Basic card (it has notes referencing it)
    const basicCard = page
      .locator(".group")
      .filter({ hasText: "E2E Basic" })
      .first();
    await expect(basicCard).toBeVisible({ timeout: 10_000 });

    // Click the trash icon (z-20 button inside the card)
    await basicCard
      .locator("button")
      .filter({ has: page.locator("svg") })
      .last()
      .click();

    // Confirmation dialog should appear
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Click the Delete button to confirm
    await dialog.getByRole("button", { name: "Delete" }).click();

    // Error message should appear — transport surfaces "{METHOD} {url} failed" or
    // the service message "Cannot delete note type that is referenced by existing notes"
    await expect(
      dialog.getByText(/cannot delete|referenced|failed/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Note type CRUD tests (serial, creates/destroys throwaway data)
// ---------------------------------------------------------------------------

test.describe("Note type CRUD", () => {
  test.describe.configure({ mode: "serial" });

  let createdNoteTypeId: string | undefined;

  test("create note type", async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });

    // Click "New Note Type" button
    await page.getByRole("button", { name: "New Note Type" }).click();

    // Dialog should open
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill in name
    await page.locator("#note-type-name").fill("E2E TestType");

    // Fill in fields (comma-separated)
    await page.locator("#note-type-fields").clear();
    await page.locator("#note-type-fields").fill("Question, Answer, Hint");

    // Click Create
    await dialog.getByRole("button", { name: "Create" }).click();

    // Dialog should close and new card should appear
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("E2E TestType")).toBeVisible({
      timeout: 10_000,
    });

    // Should show "3 fields" badge
    const newCard = page
      .locator(".group")
      .filter({ hasText: "E2E TestType" })
      .first();
    await expect(newCard.getByText("3 fields")).toBeVisible({ timeout: 5_000 });
  });

  test("edit note type name", async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });

    // Click the card's invisible overlay button to open editor
    await expect(page.getByText("E2E TestType")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByLabel("Edit E2E TestType").click();

    // Editor dialog should open
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Verify description text
    await expect(
      dialog.getByText("Edit fields, templates, and styling"),
    ).toBeVisible();

    // Change name via the "Note Type Name" labeled input
    const nameInput = dialog.getByLabel("Note Type Name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.clear();
    await nameInput.fill("E2E Renamed Type");

    // Click the first Save button (the name editor's Save button)
    await dialog.getByRole("button", { name: "Save" }).first().click();

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // Verify updated name appears on the page
    await expect(page.getByText("E2E Renamed Type")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("E2E TestType")).toBeHidden();
  });

  test("add field to note type", async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });

    // Open the editor for the renamed type
    await expect(page.getByText("E2E Renamed Type")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByLabel("Edit E2E Renamed Type").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Go to "Fields" tab (it should be the default, but click to be sure)
    await dialog.getByRole("tab", { name: "Fields" }).click();

    // Fill the new field input (placeholder "New field name")
    const newFieldInput = dialog.getByPlaceholder("New field name");
    await expect(newFieldInput).toBeVisible({ timeout: 5_000 });
    await newFieldInput.fill("ExtraField");

    // Click Add
    await dialog.getByRole("button", { name: "Add" }).click();

    // Click "Save Fields"
    await dialog.getByRole("button", { name: "Save Fields" }).click();

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // Reload to see updated badge
    await page.reload({ waitUntil: "networkidle" });

    // Should now show "4 fields"
    const updatedCard = page
      .locator(".group")
      .filter({ hasText: "E2E Renamed Type" })
      .first();
    await expect(updatedCard).toBeVisible({ timeout: 10_000 });
    await expect(updatedCard.getByText("4 fields")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("delete note type without notes succeeds", async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });

    // Find the card for the renamed type
    const targetCard = page
      .locator(".group")
      .filter({ hasText: "E2E Renamed Type" })
      .first();
    await expect(targetCard).toBeVisible({ timeout: 10_000 });

    // Click the trash icon button
    await targetCard
      .locator("button")
      .filter({ has: page.locator("svg") })
      .last()
      .click();

    // Confirmation dialog should appear
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Confirm delete
    await dialog.getByRole("button", { name: "Delete" }).click();

    // Dialog should close and the card should be gone
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("E2E Renamed Type")).toBeHidden({
      timeout: 10_000,
    });
  });
});
