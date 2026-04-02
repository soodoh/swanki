import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

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

/**
 * Assert that each sound player's audio is accessible via the swanki-media://
 * custom Electron protocol. Uses window.fetch() (enabled by supportFetchAPI on
 * the registered scheme) to verify:
 *   1. The file is served with status 200 and Content-Type: audio/*
 *   2. Range requests return 206 Partial Content (required for audio seeking)
 *
 * This catches the original bugs — unregistered/unprivileged scheme, missing
 * Content-Type header — without relying on actual audio playback (the minimal
 * fixture MP3s may not be decodable by all Chromium builds).
 */
export async function assertSoundPlayersWork(page: Page): Promise<void> {
	const soundPlayers = page.locator(".sound-player");
	const count = await soundPlayers.count();
	for (let i = 0; i < count; i++) {
		const audio = soundPlayers.nth(i).locator("audio");
		const src = await audio.getAttribute("src");
		expect(src).toContain("swanki-media://media/");

		const result = await page.evaluate(async (url: string) => {
			// Full fetch — verifies scheme is reachable and returns audio MIME type
			const full = await fetch(url);
			const bytes = await full.arrayBuffer();

			// Range fetch — verifies 206 support needed for audio seeking
			const range = await fetch(url, { headers: { Range: "bytes=0-99" } });

			return {
				status: full.status,
				contentType: full.headers.get("Content-Type"),
				size: bytes.byteLength,
				rangeStatus: range.status,
			};
		}, src as string);

		expect(result.status).toBe(200);
		expect(result.contentType).toMatch(/^audio\//);
		expect(result.size).toBeGreaterThan(0);
		expect(result.rangeStatus).toBe(206);
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
