import { expect, type Page } from "@playwright/test";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");

export async function uploadFixture(
  page: Page,
  filename: string,
): Promise<void> {
  await page.goto("/import", { waitUntil: "networkidle" });

  // Ensure we're on the import page (not redirected to login)
  await expect(page.getByText("Upload File")).toBeVisible({ timeout: 15_000 });

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(join(FIXTURES_DIR, filename));

  // Wait for file info bar to appear (shows filename)
  await expect(page.getByText(filename)).toBeVisible({ timeout: 10_000 });
}

export async function goToConfigureStep(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Configure Import")).toBeVisible();
}

export async function goToPreviewStep(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Preview Import")).toBeVisible();
}

export async function waitForPreviewLoad(page: Page): Promise<void> {
  // Wait for "Loading preview..." to disappear
  await expect(page.getByText("Loading preview...")).toBeHidden({
    timeout: 30_000,
  });
}

export async function startImport(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start Import" }).click();
}

export async function waitForImportComplete(page: Page): Promise<void> {
  await expect(page.getByText("Import Successful")).toBeVisible({
    timeout: 60_000,
  });
}

export async function assertPreviewStats(
  page: Page,
  expected: { cards: number; decks: number; media: number },
): Promise<void> {
  // Total cards stat
  const cardsBlock = page
    .locator("div")
    .filter({ hasText: "Total cards" })
    .filter({ hasText: String(expected.cards) });
  await expect(cardsBlock.first()).toBeVisible();

  // Decks stat
  const decksBlock = page
    .locator("div")
    .filter({ hasText: "Decks" })
    .filter({ hasText: String(expected.decks) });
  await expect(decksBlock.first()).toBeVisible();

  // Media files stat
  const mediaBlock = page
    .locator("div")
    .filter({ hasText: "Media files" })
    .filter({ hasText: String(expected.media) });
  await expect(mediaBlock.first()).toBeVisible();
}

export async function assertImportResults(
  page: Page,
  expected: {
    cards: number;
    notes: number;
    media: number;
    notesUpdated?: number;
  },
): Promise<void> {
  // Cards imported
  const cardsBlock = page
    .locator("div")
    .filter({ hasText: "Cards imported" })
    .filter({ hasText: String(expected.cards) });
  await expect(cardsBlock.first()).toBeVisible();

  // Notes created
  const notesBlock = page
    .locator("div")
    .filter({ hasText: "Notes created" })
    .filter({ hasText: String(expected.notes) });
  await expect(notesBlock.first()).toBeVisible();

  // Media files
  if (expected.media > 0) {
    const mediaBlock = page
      .locator("div")
      .filter({ hasText: "Media files" })
      .filter({ hasText: String(expected.media) });
    await expect(mediaBlock.first()).toBeVisible();
  }

  if (expected.notesUpdated !== undefined && expected.notesUpdated > 0) {
    const updatedBlock = page
      .locator("div")
      .filter({ hasText: "Notes updated" })
      .filter({ hasText: String(expected.notesUpdated) });
    await expect(updatedBlock.first()).toBeVisible();
  }
}

export async function goToDashboard(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Go to Dashboard" }).click();
  await page.waitForURL("**/", { timeout: 10_000 });
}
