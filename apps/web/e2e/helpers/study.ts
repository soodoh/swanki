import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Assert that media elements (images and audio) in the card content
 * are present and loaded correctly.
 */
export async function assertMediaLoads(page: Page): Promise<void> {
  const cardContent = page.locator(".card-content");
  await expect(cardContent).toBeVisible();

  // Check images load
  const images = cardContent.locator("img");
  const imgCount = await images.count();
  for (let i = 0; i < imgCount; i++) {
    const img = images.nth(i);
    const src = await img.getAttribute("src");
    expect(src).toContain("/api/media/");

    // Verify image loaded (naturalWidth > 0)
    const loaded = await img.evaluate(
      (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
    );
    expect(loaded).toBe(true);
  }

  // Check audio elements
  const audios = cardContent.locator("audio");
  const audioCount = await audios.count();
  for (let i = 0; i < audioCount; i++) {
    const audio = audios.nth(i);
    const src = await audio.getAttribute("src");
    expect(src).toContain("/api/media/");

    // Verify media URL is accessible
    if (src) {
      const origin = new URL(page.url()).origin;
      const fullUrl = src.startsWith("http") ? src : `${origin}${src}`;
      const response = await page.request.get(fullUrl);
      expect(response.status()).toBe(200);
    }
  }
}

/**
 * Also check audio inside .sound-player elements (alternative rendering path).
 */
export async function assertSoundPlayersWork(page: Page): Promise<void> {
  const soundPlayers = page.locator(".sound-player audio");
  const count = await soundPlayers.count();
  for (let i = 0; i < count; i++) {
    const src = await soundPlayers.nth(i).getAttribute("src");
    expect(src).toContain("/api/media/");
  }
}

/**
 * Show the answer by pressing Space.
 */
export async function showAnswer(page: Page): Promise<void> {
  // Try clicking the Show Answer button, or press space
  const showBtn = page.getByRole("button", { name: /Show Answer/i });
  if (await showBtn.isVisible()) {
    await showBtn.click();
  } else {
    await page.keyboard.press("Space");
  }
}

/**
 * Rate the current card with a key press (1=Again, 2=Hard, 3=Good, 4=Easy).
 */
export async function rateCard(
  page: Page,
  rating: 1 | 2 | 3 | 4,
): Promise<void> {
  await page.keyboard.press(String(rating));
  // Wait for next card to load or congrats screen
  await page.waitForTimeout(500);
}

/**
 * Study through multiple cards, asserting media loads for each one.
 * Returns the number of cards reviewed.
 */
export async function studyCardsWithMediaAssertions(
  page: Page,
  maxCards: number,
): Promise<number> {
  let reviewed = 0;

  // Wait for either card content or congrats to appear
  await expect(
    page.locator(".card-content").or(page.getByText("Congratulations!")),
  ).toBeVisible({ timeout: 15_000 });

  for (let i = 0; i < maxCards; i++) {
    // Check if study is complete (congrats screen)
    const congrats = page.getByText("Congratulations!");
    if (await congrats.isVisible({ timeout: 1000 }).catch(() => false)) {
      break;
    }

    // Wait for card content to be visible
    const cardContent = page.locator(".card-content");
    await expect(cardContent).toBeVisible({ timeout: 10_000 });

    // Assert media on question side
    await assertMediaLoads(page);

    // Show answer
    await showAnswer(page);

    // Small wait for answer to render
    await page.waitForTimeout(300);

    // Assert media on answer side
    await assertMediaLoads(page);

    // Rate as Good (3)
    await rateCard(page, 3);
    reviewed++;
  }

  return reviewed;
}
