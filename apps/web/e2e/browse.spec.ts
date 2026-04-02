import { expect, test } from "@playwright/test";

import { createDeck, createNote, deleteDeck } from "./helpers/api";
import { SEED } from "./helpers/seed-data";

// ---------------------------------------------------------------------------
// Read-only browse tests (parallel-safe, no mutations)
// ---------------------------------------------------------------------------

test.describe("Browse page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/browse", { waitUntil: "networkidle" });
	});

	test("page loads with seeded notes", async ({ page }) => {
		await expect(page.getByText("hablar")).toBeVisible();
		await expect(page.getByText("comer")).toBeVisible();
	});

	test("free-text search filters results", async ({ page }) => {
		const searchInput = page.getByPlaceholder(
			"Search notes... (e.g., deck:Japanese tag:verb is:new)",
		);
		await searchInput.fill("hablar");
		await searchInput.press("Enter");
		await page.waitForURL(/q=hablar/, { timeout: 10_000 });
		await expect(page.getByText("hablar")).toBeVisible();
		await expect(page.getByText("comer")).toBeHidden();
	});

	test("filter by deck", async ({ page }) => {
		// Open the deck select dropdown and pick "Math"
		const deckTrigger = page
			.locator('[role="combobox"]')
			.filter({ hasText: /All Decks/i })
			.first();
		await deckTrigger.click();
		await page.getByRole("option", { name: "Math", exact: true }).click();

		// Wait for the URL to update with deck filter
		await page.waitForURL(/deck%3AMath|deck:Math/, { timeout: 10_000 });
		await expect(page.getByText("2+2")).toBeVisible();
		await expect(page.getByText("hablar")).toBeHidden();
	});

	test("state toggle buttons filter results", async ({ page }) => {
		await page.getByRole("button", { name: "new", exact: true }).click();
		await expect(page).toHaveURL(/is%3Anew|is:new/);
	});

	test("empty results shows message", async ({ page }) => {
		const searchInput = page.getByPlaceholder(
			"Search notes... (e.g., deck:Japanese tag:verb is:new)",
		);
		await searchInput.fill("xyznonexistent123");
		await searchInput.press("Enter");
		await page.waitForURL(/q=xyznonexistent123/, { timeout: 10_000 });
		await expect(page.getByText(/No notes found/i)).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Browse note editing tests (serial, creates/destroys throwaway data)
// ---------------------------------------------------------------------------

test.describe("Browse note editing", () => {
	test.describe.configure({ mode: "serial" });

	let throwawayDeckId: string;
	let _throwawayNoteId: string;

	test("setup: create throwaway note", async ({ page }) => {
		const deck = await createDeck(page, { name: "BrowseTestDeck" });
		throwawayDeckId = deck.id;

		const note = await createNote(page, {
			noteTypeId: SEED.noteTypes.basic.id,
			deckId: throwawayDeckId,
			fields: { Front: "BrowseTestFront", Back: "BrowseTestBack" },
		});
		_throwawayNoteId = note.id;
	});

	test("click note opens editor", async ({ page }) => {
		await page.goto("/browse", { waitUntil: "networkidle" });

		// Find the row containing our throwaway note and click it
		const row = page.getByRole("row").filter({ hasText: "BrowseTestFront" });
		await expect(row).toBeVisible({ timeout: 10_000 });
		await row.click();

		// The modal should open with title "Edit Note"
		await expect(
			page.getByRole("dialog").getByRole("heading", { name: "Edit Note" }),
		).toBeVisible({ timeout: 10_000 });

		// The field value should be pre-populated
		// Find the Front field's container div and then its input
		const dialog = page.getByRole("dialog");
		const frontField = dialog
			.locator("div.space-y-1")
			.filter({ hasText: /^Front/ });
		const frontInput = frontField.locator("input").first();
		await expect(frontInput).toBeVisible();
		await expect(frontInput).toHaveValue("BrowseTestFront");
	});

	test("edit note fields and save", async ({ page }) => {
		await page.goto("/browse", { waitUntil: "networkidle" });

		const row = page.getByRole("row").filter({ hasText: "BrowseTestFront" });
		await expect(row).toBeVisible({ timeout: 10_000 });
		await row.click();

		await expect(
			page.getByRole("dialog").getByRole("heading", { name: "Edit Note" }),
		).toBeVisible({ timeout: 10_000 });

		// Edit the Front field
		const dialog = page.getByRole("dialog");
		const frontField = dialog
			.locator("div.space-y-1")
			.filter({ hasText: /^Front/ });
		const frontInput = frontField.locator("input").first();
		await expect(frontInput).toHaveValue("BrowseTestFront");
		await frontInput.clear();
		await frontInput.fill("BrowseTestEdited");

		// Save
		await page.getByRole("button", { name: /Save Changes/i }).click();

		// Close the dialog
		await page.keyboard.press("Escape");

		// Reload and verify the updated text appears in the table
		await page.reload({ waitUntil: "networkidle" });
		await expect(page.getByText("BrowseTestEdited")).toBeVisible({
			timeout: 10_000,
		});
	});

	test("suspend note from editor", async ({ page }) => {
		await page.goto("/browse", { waitUntil: "networkidle" });

		const row = page.getByRole("row").filter({ hasText: "BrowseTestEdited" });
		await expect(row).toBeVisible({ timeout: 10_000 });
		await row.click();

		await expect(
			page.getByRole("dialog").getByRole("heading", { name: "Edit Note" }),
		).toBeVisible({ timeout: 10_000 });

		// Click "Suspend Note"
		await page.getByRole("button", { name: "Suspend Note" }).click();

		// Close the dialog
		await page.keyboard.press("Escape");

		// Wait for dialog to close and the table to reflect suspension
		await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });

		// Reload to ensure we see the persisted state
		await page.reload({ waitUntil: "networkidle" });

		// The note's row should now show the "Suspended" badge
		const updatedRow = page
			.getByRole("row")
			.filter({ hasText: "BrowseTestEdited" });
		await expect(updatedRow).toBeVisible({ timeout: 10_000 });
		await expect(updatedRow.getByText("Suspended")).toBeVisible();
	});

	test("unsuspend note from editor", async ({ page }) => {
		await page.goto("/browse", { waitUntil: "networkidle" });

		const row = page.getByRole("row").filter({ hasText: "BrowseTestEdited" });
		await expect(row).toBeVisible({ timeout: 10_000 });
		await row.click();

		await expect(
			page.getByRole("dialog").getByRole("heading", { name: "Edit Note" }),
		).toBeVisible({ timeout: 10_000 });

		// When already suspended, the button reads "Unsuspend Note"
		await page.getByRole("button", { name: "Unsuspend Note" }).click();

		// Close the dialog and verify no "Suspended" badge
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });

		await page.reload({ waitUntil: "networkidle" });
		const updatedRow = page
			.getByRole("row")
			.filter({ hasText: "BrowseTestEdited" });
		await expect(updatedRow).toBeVisible({ timeout: 10_000 });
		await expect(updatedRow.getByText("Suspended")).toBeHidden();
	});

	test("delete note from editor", async ({ page }) => {
		await page.goto("/browse", { waitUntil: "networkidle" });

		const row = page.getByRole("row").filter({ hasText: "BrowseTestEdited" });
		await expect(row).toBeVisible({ timeout: 10_000 });
		await row.click();

		await expect(
			page.getByRole("dialog").getByRole("heading", { name: "Edit Note" }),
		).toBeVisible({ timeout: 10_000 });

		// Click the "Delete Note" button to open confirmation dialog
		await page.getByRole("button", { name: "Delete Note" }).click();

		// Confirm deletion in the nested dialog
		await page
			.getByRole("dialog")
			.filter({ hasText: "Delete Note" })
			.last()
			.getByRole("button", { name: "Delete" })
			.click();

		// Dialog should close after deletion
		await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

		// Note should no longer appear in the table
		await expect(page.getByText("BrowseTestEdited")).toBeHidden({
			timeout: 10_000,
		});

		// Cleanup: delete the deck too (note already deleted)
		await deleteDeck(page, throwawayDeckId);
	});
});
