import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Assert that media elements in the card content are present and loaded.
 * Desktop uses the swanki-media:// custom Electron protocol instead of
 * HTTP /api/media/ — we verify the src attribute format and image load state.
 */
export async function assertMediaLoads(page: Page): Promise<void> {
  const cardContent = page.locator(".prose");
  await expect(cardContent).toBeVisible();

  const images = cardContent.locator("img");
  const imgCount = await images.count();
  for (let i = 0; i < imgCount; i++) {
    const img = images.nth(i);
    const src = await img.getAttribute("src");
    // Desktop serves media via the swanki-media:// Electron protocol
    expect(src).toContain("swanki-media://media/");

    // Verify image loaded (naturalWidth > 0)
    const loaded = await img.evaluate(
      (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
    );
    expect(loaded).toBe(true);
  }

  // Check audio elements — verify src format only.
  // page.request.get() cannot fetch swanki-media:// (it's a custom Electron protocol).
  const audios = cardContent.locator("audio");
  const audioCount = await audios.count();
  for (let i = 0; i < audioCount; i++) {
    const src = await audios.nth(i).getAttribute("src");
    expect(src).toContain("swanki-media://media/");
  }
}

export async function assertSoundPlayersWork(page: Page): Promise<void> {
  const soundPlayers = page.locator(".sound-player audio");
  const count = await soundPlayers.count();
  for (let i = 0; i < count; i++) {
    const src = await soundPlayers.nth(i).getAttribute("src");
    expect(src).toContain("swanki-media://media/");
  }
}

export async function showAnswer(page: Page): Promise<void> {
  const showBtn = page.getByRole("button", { name: /Show Answer/i });
  const isVisible = await showBtn.isVisible();
  await (isVisible ? showBtn.click() : page.keyboard.press("Space"));
}

export async function rateCard(
  page: Page,
  rating: 1 | 2 | 3 | 4,
): Promise<void> {
  await page.keyboard.press(String(rating));
  await page.waitForTimeout(500);
}

export async function studyCardsWithMediaAssertions(
  page: Page,
  maxCards: number,
): Promise<number> {
  let reviewed = 0;

  await expect(
    page.locator(".prose").or(page.getByText("Congratulations!")),
  ).toBeVisible({ timeout: 15_000 });

  for (let i = 0; i < maxCards; i++) {
    const congrats = page.getByText("Congratulations!");
    if (await congrats.isVisible({ timeout: 1000 }).catch(() => false)) {
      break;
    }

    const cardContent = page.locator(".prose");
    await expect(cardContent).toBeVisible({ timeout: 10_000 });

    await assertMediaLoads(page);
    await showAnswer(page);
    await page.waitForTimeout(300);
    await assertMediaLoads(page);
    await rateCard(page, 3);
    reviewed++;
  }

  return reviewed;
}
