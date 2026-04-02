import { expect, test } from "@playwright/test";

import { createDeck, deleteDeck } from "./helpers/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Open the three-dot action menu for a deck row identified by its name text.
 * The deck row is an <a> element; the MoreHorizontal button is the last <button>
 * nested inside it (wrapped in a presentation span).
 */
async function openDeckActionMenu(
	page: import("@playwright/test").Page,
	deckName: string,
): Promise<void> {
	const deckRow = page.locator("a").filter({ hasText: deckName }).first();
	await expect(deckRow).toBeVisible({ timeout: 10_000 });
	await deckRow.hover();
	// The action-menu trigger is the last button inside the row
	await deckRow.locator("button").last().click();
}

// ---------------------------------------------------------------------------
// Read-only deck tests (parallel-safe, no mutations)
// ---------------------------------------------------------------------------

test.describe("Deck management - read-only", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });
	});

	test("seeded decks are visible on dashboard", async ({ page }) => {
		await expect(page.getByText("Spanish", { exact: true })).toBeVisible();
		await expect(page.getByText("Math", { exact: true })).toBeVisible();
		await expect(page.getByText("Empty", { exact: true })).toBeVisible();
	});

	test("nested deck visible under parent", async ({ page }) => {
		// The seeded child deck is stored as "Spanish::Verbs"
		await expect(page.getByText("Spanish::Verbs")).toBeVisible();
	});

	test("click deck navigates to study", async ({ page }) => {
		// The deck row is an <a> element whose DnD attributes cause it to appear as
		// a "button" in the ARIA tree. Click the name span directly to navigate.
		const mathRow = page.locator("a").filter({ hasText: /^Math/ }).first();
		await expect(mathRow).toBeVisible({ timeout: 10_000 });
		await mathRow.locator("span").filter({ hasText: /^Math/ }).click();
		await page.waitForURL(/\/study\//, { timeout: 10_000 });
		expect(page.url()).toMatch(/\/study\//);
	});
});

// ---------------------------------------------------------------------------
// Deck CRUD tests (serial, creates/destroys throwaway data)
// ---------------------------------------------------------------------------

test.describe("Deck CRUD", () => {
	test.describe.configure({ mode: "serial" });

	test("create deck via dialog", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		// Open the Add Deck dialog
		await page.getByRole("button", { name: "Add Deck" }).click();

		// Fill in the name input (placeholder "Deck name")
		await page.getByPlaceholder("Deck name").fill("E2E Test Deck");

		// Submit
		await page.getByRole("button", { name: "Create Deck" }).click();

		// New deck should appear in the list
		await expect(page.getByText("E2E Test Deck")).toBeVisible({
			timeout: 10_000,
		});
	});

	test("rename deck via settings dialog", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		await expect(page.getByText("E2E Test Deck")).toBeVisible({
			timeout: 10_000,
		});

		await openDeckActionMenu(page, "E2E Test Deck");

		// Click "Options" menu item
		await page.getByRole("menuitem", { name: "Options" }).click();

		// The Options dialog should open with #opt-name input
		const nameInput = page.locator("#opt-name");
		await expect(nameInput).toBeVisible({ timeout: 5_000 });

		// Clear and type new name
		await nameInput.clear();
		await nameInput.fill("E2E Renamed Deck");

		// Save
		await page.getByRole("button", { name: "Save" }).click();

		// Verify renamed deck is visible
		await expect(page.getByText("E2E Renamed Deck")).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByText("E2E Test Deck")).toBeHidden();
	});

	test("delete deck with confirmation", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		await expect(page.getByText("E2E Renamed Deck")).toBeVisible({
			timeout: 10_000,
		});

		await openDeckActionMenu(page, "E2E Renamed Deck");

		// Click "Delete" menu item
		await page.getByRole("menuitem", { name: "Delete" }).click();

		// Confirm in the confirmation dialog
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.getByRole("button", { name: "Delete" }).click();

		// Wait for the dialog to close before checking the deck list
		await expect(dialog).toBeHidden({ timeout: 10_000 });

		// Deck should be removed from the list
		await expect(
			page.locator("a").filter({ hasText: "E2E Renamed Deck" }),
		).toBeHidden({ timeout: 10_000 });
	});

	test("delete parent deck re-parents children", async ({ page }) => {
		// Create parent + child via API
		const parent = await createDeck(page, { name: "E2E Parent Deck" });
		const child = await createDeck(page, {
			name: "E2E Child Deck",
			parentId: parent.id,
		});

		await page.goto("/", { waitUntil: "networkidle" });

		// Both should be visible
		await expect(page.getByText("E2E Parent Deck")).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByText("E2E Child Deck")).toBeVisible({
			timeout: 10_000,
		});

		// Delete the parent via UI
		await openDeckActionMenu(page, "E2E Parent Deck");
		await page.getByRole("menuitem", { name: "Delete" }).click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.getByRole("button", { name: "Delete" }).click();

		// Wait for dialog to close then verify parent is gone
		await expect(dialog).toBeHidden({ timeout: 10_000 });
		await expect(
			page.locator("a").filter({ hasText: "E2E Parent Deck" }),
		).toBeHidden({ timeout: 10_000 });

		// Child should still be visible (re-parented to top level)
		await expect(
			page.locator("a").filter({ hasText: "E2E Child Deck" }),
		).toBeVisible({ timeout: 10_000 });

		// Cleanup child deck via API
		await deleteDeck(page, child.id);
	});
});
