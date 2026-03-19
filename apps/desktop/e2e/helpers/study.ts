import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Assert that media elements in the card content are present and loaded.
 * Desktop uses the swanki-media:// custom Electron protocol instead of
 * HTTP /api/media/ — we verify the src attribute format, image load state,
 * and audio load state.
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

  // Check audio elements — verify src format and that the audio actually loaded
  // from the custom protocol. readyState >= HAVE_CURRENT_DATA (2) means the
  // browser has buffered enough data to start playback, which confirms the
  // swanki-media:// scheme is registered as privileged and can stream media.
  const audios = cardContent.locator("audio");
  const audioCount = await audios.count();
  for (let i = 0; i < audioCount; i++) {
    const audio = audios.nth(i);
    const src = await audio.getAttribute("src");
    expect(src).toContain("swanki-media://media/");

    await expect(async () => {
      const readyState = await audio.evaluate(
        (el: HTMLAudioElement) => el.readyState,
      );
      expect(readyState).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5000 });
  }
}

/**
 * Assert that sound player audio elements autoplayed when the card face was
 * rendered. Checks that each player is either currently playing, has advanced
 * past 0 s, or has ended — any of these confirms autoplay was not blocked by
 * the browser's autoplay policy. Minimal fixture MP3s may finish before the
 * assertion runs, so `ended` is included as a valid "has played" state.
 */
export async function assertSoundPlayersWork(page: Page): Promise<void> {
  const soundPlayers = page.locator(".sound-player audio");
  const count = await soundPlayers.count();
  for (let i = 0; i < count; i++) {
    const audio = soundPlayers.nth(i);
    const src = await audio.getAttribute("src");
    expect(src).toContain("swanki-media://media/");

    await expect(async () => {
      const { paused, currentTime, ended } = await audio.evaluate(
        (el: HTMLAudioElement) => ({
          paused: el.paused,
          currentTime: el.currentTime,
          ended: el.ended,
        }),
      );
      // Audio must have played: currently playing, advanced past 0 s, or ended
      expect(!paused || currentTime > 0 || ended).toBe(true);
    }).toPass({ timeout: 3000 });
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
    await assertSoundPlayersWork(page);
    await rateCard(page, 3);
    reviewed++;
  }

  return reviewed;
}
