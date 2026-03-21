import { test, expect } from "@playwright/test";

import { createDeck, createNote } from "./helpers/api";
import { SEED } from "./helpers/seed-data";

test.describe("Study Actions", () => {
  test.describe.configure({ mode: "serial" });

  let deckId: string;

  test("setup: create deck with notes for study", async ({ page }) => {
    const deck = await createDeck(page, { name: "StudyActionsTest" });
    deckId = deck.id;

    await createNote(page, {
      noteTypeId: SEED.noteTypes.basic.id,
      deckId,
      fields: { Front: "StudyQ1", Back: "StudyA1" },
    });
    await createNote(page, {
      noteTypeId: SEED.noteTypes.basic.id,
      deckId,
      fields: { Front: "StudyQ2", Back: "StudyA2" },
    });
    await createNote(page, {
      noteTypeId: SEED.noteTypes.basic.id,
      deckId,
      fields: { Front: "StudyQ3", Back: "StudyA3" },
    });

    expect(deckId).toBeTruthy();
  });

  test("study page loads with progress counters", async ({ page }) => {
    await page.goto(`/study/${deckId}`, { waitUntil: "networkidle" });

    // Either card content or congrats should be visible
    await expect(
      page.locator(".prose").or(page.getByText("Congratulations!")),
    ).toBeVisible({ timeout: 15_000 });

    // Show Answer button should be visible (we have cards to study)
    await expect(
      page.getByRole("button", { name: /Show Answer/i }),
    ).toBeVisible();
  });

  test("Space shows answer and rating buttons", async ({ page }) => {
    await page.goto(`/study/${deckId}`, { waitUntil: "networkidle" });
    await expect(page.locator(".prose")).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Space");

    // Rating buttons should now be visible
    await expect(page.getByRole("button", { name: /Again/i })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("button", { name: /Hard/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Good/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Easy/i })).toBeVisible();
  });

  test("rating buttons show interval previews", async ({ page }) => {
    await page.goto(`/study/${deckId}`, { waitUntil: "networkidle" });
    await expect(page.locator(".prose")).toBeVisible({ timeout: 15_000 });

    // Show the answer
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: /Good/i })).toBeVisible({
      timeout: 5_000,
    });

    // Wait a moment for interval previews to load
    await page.waitForTimeout(1_000);

    // Good button should contain label + interval text (e.g. "Good (3) 1d")
    const goodBtn = page.getByRole("button", { name: /Good/i });
    await expect(goodBtn).toHaveText(/Good.*\d/);
  });

  test("keyboard rating advances to next card", async ({ page }) => {
    await page.goto(`/study/${deckId}`, { waitUntil: "networkidle" });
    await expect(page.locator(".prose")).toBeVisible({ timeout: 15_000 });

    // Show answer
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: /Good/i })).toBeVisible({
      timeout: 5_000,
    });

    // Rate Good with keyboard
    await page.keyboard.press("3");

    // Wait for next card or congrats
    await expect(
      page.locator(".prose").or(page.getByText("Congratulations!")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("undo review with Z key", async ({ page }) => {
    await page.goto(`/study/${deckId}`, { waitUntil: "networkidle" });
    await expect(page.locator(".prose")).toBeVisible({ timeout: 15_000 });

    // Show answer and rate
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: /Good/i })).toBeVisible({
      timeout: 5_000,
    });
    await page.keyboard.press("3");

    // Undo button should appear after rating
    await expect(page.getByRole("button", { name: /Undo/i })).toBeVisible({
      timeout: 10_000,
    });

    // Press Z to undo
    await page.keyboard.press("z");

    // Wait for undo to process
    await page.waitForTimeout(1_000);

    // Undo button should disappear
    await expect(page.getByRole("button", { name: /Undo/i })).toBeHidden({
      timeout: 5_000,
    });
  });

  test("suspend card from menu", async ({ page }) => {
    await page.goto(`/study/${deckId}`, { waitUntil: "networkidle" });
    await expect(page.locator(".prose")).toBeVisible({ timeout: 15_000 });

    // Click the three-dot menu trigger (MoreHorizontal icon button in header)
    const menuTrigger = page
      .locator("header")
      .locator("button:has(svg)")
      .last();
    await menuTrigger.click();

    // Click "Suspend Card" menuitem
    await page.getByRole("menuitem", { name: "Suspend Card" }).click();

    // Next card or congrats should load
    await expect(
      page.locator(".prose").or(page.getByText("Congratulations!")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("bury card from menu", async ({ page }) => {
    await page.goto(`/study/${deckId}`, { waitUntil: "networkidle" });
    await expect(page.locator(".prose")).toBeVisible({ timeout: 15_000 });

    // Click the three-dot menu trigger
    const menuTrigger = page
      .locator("header")
      .locator("button:has(svg)")
      .last();
    await menuTrigger.click();

    // Click "Bury Card" menuitem
    await page.getByRole("menuitem", { name: "Bury Card" }).click();

    // Next card or congrats should load
    await expect(
      page.locator(".prose").or(page.getByText("Congratulations!")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("congrats screen after all cards reviewed", async ({ page }) => {
    await page.goto(`/study/${deckId}`, { waitUntil: "networkidle" });

    // Wait for either card content or congrats to appear
    await expect(
      page.locator(".prose").or(page.getByText("Congratulations!")),
    ).toBeVisible({ timeout: 15_000 });

    // Loop: show answer + rate Good until Congratulations! is visible
    for (let i = 0; i < 20; i += 1) {
      const congrats = page.getByText("Congratulations!");
      if (await congrats.isVisible({ timeout: 1_000 }).catch(() => false)) {
        break;
      }

      const prose = page.locator(".prose");
      const proseVisible = await prose
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      if (!proseVisible) {
        break;
      }

      // Show answer if not already shown
      const showAnswerBtn = page.getByRole("button", { name: /Show Answer/i });
      if (await showAnswerBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await page.keyboard.press("Space");
        await expect(page.getByRole("button", { name: /Good/i })).toBeVisible({
          timeout: 5_000,
        });
      }

      // Rate Good
      await page.keyboard.press("3");
      await page.waitForTimeout(500);
    }

    await expect(page.getByText("Congratulations!")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/reviewed/i)).toBeVisible();
  });

  test("congrats back to dashboard", async ({ page }) => {
    await page.goto(`/study/${deckId}`, { waitUntil: "networkidle" });

    // Wait for congrats screen (deck was fully reviewed in previous test)
    await expect(page.getByText("Congratulations!")).toBeVisible({
      timeout: 15_000,
    });

    // Click Back to Dashboard
    await page.getByRole("button", { name: "Back to Dashboard" }).click();

    // Should navigate to /
    await expect(page).toHaveURL("/", { timeout: 10_000 });
  });

  test("empty deck shows congrats immediately", async ({ page }) => {
    await page.goto(`/study/${SEED.decks.empty.id}`, {
      waitUntil: "networkidle",
    });

    await expect(page.getByText("Congratulations!")).toBeVisible({
      timeout: 15_000,
    });
  });
});
