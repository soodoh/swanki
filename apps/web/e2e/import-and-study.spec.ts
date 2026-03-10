import { test, expect } from "@playwright/test";
import {
  uploadFixture,
  goToConfigureStep,
  goToPreviewStep,
  waitForPreviewLoad,
  startImport,
  waitForImportComplete,
  assertPreviewStats,
  assertImportResults,
  goToDashboard,
} from "./helpers/import";
import { studyCardsWithMediaAssertions } from "./helpers/study";

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

      // Find the Vocab study link within this format's tree using DOM traversal.
      // Each deck tree item is: <div> <div.group>name+studyLink</div> <div>children</div> </div>
      // We find the rootDeck's .group, go to its parent (the tree root div),
      // then find the Vocab .group within that subtree.
      const href = await page.evaluate((rootDeck) => {
        const spans = document.querySelectorAll("span.truncate");
        let rootGroupDiv: Element | null = null;
        for (const span of spans) {
          if (span.textContent?.trim() === rootDeck) {
            rootGroupDiv = span.closest(".group");
            break;
          }
        }
        if (!rootGroupDiv) return null;
        const treeRoot = rootGroupDiv.parentElement;
        if (!treeRoot) return null;
        const vocabSpans = treeRoot.querySelectorAll("span.truncate");
        for (const span of vocabSpans) {
          if (span.textContent?.trim() === "Vocab") {
            const vocabGroup = span.closest(".group");
            if (!vocabGroup) continue;
            const link = vocabGroup.querySelector('a[href*="/study/"]');
            if (link) return link.getAttribute("href");
          }
        }
        return null;
      }, format.rootDeck);
      expect(href).toBeTruthy();

      // Navigate directly to the study page
      await page.goto(href!);
      // Wait for study page to fully load (card or congrats)
      await page.waitForTimeout(2000);
      await page.waitForURL("**/study/**", { timeout: 10_000 });

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
    await expect(page.getByText("Unchanged", { exact: true })).toBeVisible();

    // Info text about updated notes
    await expect(
      page.getByText(/note has changed and will be updated/i),
    ).toBeVisible();

    // Complete the merge import
    await startImport(page);
    await waitForImportComplete(page);

    // Check notes updated stat
    await expect(page.getByText("Notes updated")).toBeVisible();
  });
});
