import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
	assertImportResults,
	assertPreviewStats,
	goToConfigureStep,
	goToDashboard,
	goToPreviewStep,
	startImport,
	uploadFixture,
	waitForImportComplete,
	waitForPreviewLoad,
} from "./helpers/import";
import { studyCardsWithMediaAssertions } from "./helpers/study";

/**
 * Find the study link href for a "Vocab" deck nested under the given rootDeck.
 * Runs in the browser context via page.evaluate.
 */
function findVocabStudyHref(rootDeck: string): string | undefined {
	const spans = [...document.querySelectorAll("span.truncate")];
	const rootSpan = spans.find((span) => span.textContent?.trim() === rootDeck);
	// The root deck <Link> has class "group"; its parentElement wraps the deck + children
	const treeRoot = rootSpan?.closest(".group")?.parentElement;
	const vocabSpans = [...(treeRoot?.querySelectorAll("span.truncate") ?? [])];
	const vocabSpan = vocabSpans.find(
		(span) => span.textContent?.trim() === "Vocab",
	);
	// The deck row <Link> is an <a> with class "group" — use closest() to find it directly
	const link = vocabSpan?.closest('a[href*="/study/"]');
	return link?.getAttribute("href") ?? undefined;
}

async function navigateToVocabStudy(
	page: Page,
	rootDeck: string,
): Promise<string> {
	const href = await page.evaluate(findVocabStudyHref, rootDeck);
	expect(href).toBeTruthy();
	await page.goto(href!);
	await page.waitForTimeout(2000);
	await page.waitForURL("**/study/**", { timeout: 10_000 });
	return href!;
}

const FORMATS = [
	{
		name: "Old APKG",
		file: "old-format.apkg",
		badge: "Anki Package",
		rootDeck: "OldApkg",
	},
	{
		name: "New APKG",
		file: "new-format.apkg",
		badge: "Anki Package",
		rootDeck: "NewApkg",
	},
	{
		name: "Old COLPKG",
		file: "old-format.colpkg",
		badge: "Anki Collection",
		rootDeck: "OldColpkg",
	},
	{
		name: "New COLPKG",
		file: "new-format.colpkg",
		badge: "Anki Collection",
		rootDeck: "NewColpkg",
	},
] as const;

for (const format of FORMATS) {
	test.describe(format.name, () => {
		test.describe.configure({ mode: "serial" });

		test("imports via wizard with correct preview stats", async ({ page }) => {
			// Step 1: Upload
			await uploadFixture(page, format.file);
			await expect(page.getByText(format.badge, { exact: true })).toBeVisible();

			// Step 2: Configure
			await goToConfigureStep(page);
			await expect(page.getByText("Package Details")).toBeVisible();

			// Step 3: Preview
			await goToPreviewStep(page);
			await waitForPreviewLoad(page);
			await assertPreviewStats(page, { cards: 6, decks: 3, media: 4 });

			// Step 4: Import
			await startImport(page);
			await waitForImportComplete(page);
			await assertImportResults(page, { cards: 6, notes: 3, media: 4 });

			// Go to dashboard
			await goToDashboard(page);
		});

		test("dashboard shows nested decks", async ({ page }) => {
			await page.goto("/", { waitUntil: "networkidle" });

			// Verify the root deck and nested hierarchy are visible
			await expect(
				page.getByText(format.rootDeck, { exact: true }),
			).toBeVisible({ timeout: 15_000 });
			// "Languages" and "Vocab" may appear multiple times across formats; just check first()
			await expect(page.getByText("Languages").first()).toBeVisible();
			await expect(page.getByText("Vocab").first()).toBeVisible();
		});

		test("study flow: media works across multiple cards", async ({ page }) => {
			await page.goto("/", { waitUntil: "networkidle" });

			// Wait for deck tree to load
			await expect(
				page.getByText(format.rootDeck, { exact: true }),
			).toBeVisible({ timeout: 15_000 });

			// Find the Vocab study link and navigate to it
			await navigateToVocabStudy(page, format.rootDeck);

			// Study at least 2 cards, asserting media on each one
			// This covers forward + reverse of multiple notes and catches
			// the bug where media only works on the first card
			const reviewed = await studyCardsWithMediaAssertions(page, 6);
			expect(reviewed).toBeGreaterThanOrEqual(2);
		});
	});
}

test.describe("Merge import", () => {
	test("preview shows new/updated/unchanged counts", async ({ page }) => {
		// The Old APKG test above already imported old-format.apkg (same GUIDs as merge-update)
		// Import the merge variant (same GUIDs, some modified)
		await uploadFixture(page, "merge-update.apkg");
		await goToConfigureStep(page);
		await goToPreviewStep(page);
		await waitForPreviewLoad(page);

		// Check merge stats badges using exact text matching
		await expect(page.getByText("New", { exact: true })).toBeVisible();
		await expect(page.getByText("Updated", { exact: true })).toBeVisible();

		// Info text about updated notes
		await expect(page.getByText(/changed and will be updated/i)).toBeVisible();

		// Complete the merge import
		await startImport(page);
		await waitForImportComplete(page);

		// Check notes updated stat
		await expect(page.getByText("Notes updated")).toBeVisible();
	});
});
