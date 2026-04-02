import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { RENDERER_URL } from "./global-setup";
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

function findVocabStudyHref(rootDeck: string): string | undefined {
	const spans = [...document.querySelectorAll("span.truncate")];
	const rootSpan = spans.find((span) => span.textContent?.trim() === rootDeck);
	const treeRoot = rootSpan?.closest(".group")?.parentElement;
	const vocabSpans = [...(treeRoot?.querySelectorAll("span.truncate") ?? [])];
	const vocabSpan = vocabSpans.find(
		(span) => span.textContent?.trim() === "Vocab",
	);
	const link = vocabSpan?.closest('a[href*="/study/"]');
	return link?.getAttribute("href") ?? undefined;
}

async function navigateToVocabStudy(
	page: Page,
	rootDeck: string,
): Promise<string> {
	const href = await page.evaluate(findVocabStudyHref, rootDeck);
	expect(href).toBeTruthy();
	await page.goto(`${RENDERER_URL}${href!}`);
	await page.waitForTimeout(2000);
	await page.waitForURL(`${RENDERER_URL}**/study/**`, { timeout: 10_000 });
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
			await uploadFixture(page, format.file);
			await expect(page.getByText(format.badge, { exact: true })).toBeVisible();

			await goToConfigureStep(page);
			await expect(page.getByText("Package Details")).toBeVisible();

			await goToPreviewStep(page);
			await waitForPreviewLoad(page);
			await assertPreviewStats(page, { cards: 6, decks: 3, media: 4 });

			await startImport(page);
			await waitForImportComplete(page);
			await assertImportResults(page, { cards: 6, notes: 3, media: 4 });

			await goToDashboard(page);
		});

		test("dashboard shows nested decks", async ({ page }) => {
			await page.goto(`${RENDERER_URL}/`, { waitUntil: "networkidle" });

			await expect(
				page.getByText(format.rootDeck, { exact: true }),
			).toBeVisible({ timeout: 15_000 });
			await expect(page.getByText("Languages").first()).toBeVisible();
			await expect(page.getByText("Vocab").first()).toBeVisible();
		});

		test("study flow: media works across multiple cards", async ({ page }) => {
			await page.goto(`${RENDERER_URL}/`, { waitUntil: "networkidle" });

			await expect(
				page.getByText(format.rootDeck, { exact: true }),
			).toBeVisible({ timeout: 15_000 });

			await navigateToVocabStudy(page, format.rootDeck);

			const reviewed = await studyCardsWithMediaAssertions(page, 6);
			expect(reviewed).toBeGreaterThanOrEqual(2);
		});
	});
}

test.describe("Merge import", () => {
	test("preview shows new/updated/unchanged counts", async ({ page }) => {
		await uploadFixture(page, "merge-update.apkg");
		await goToConfigureStep(page);
		await goToPreviewStep(page);
		await waitForPreviewLoad(page);

		await expect(page.getByText("New", { exact: true })).toBeVisible();
		await expect(page.getByText("Updated", { exact: true })).toBeVisible();
		await expect(page.getByText(/changed and will be updated/i)).toBeVisible();

		await startImport(page);
		await waitForImportComplete(page);

		await expect(page.getByText("Notes updated")).toBeVisible();
	});
});
