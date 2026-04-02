import { expect, test } from "@playwright/test";

test.describe("Statistics page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/stats", { waitUntil: "networkidle" });
	});

	test("streak display renders", async ({ page }) => {
		await expect(page.getByText("Streak")).toBeVisible();
		await expect(page.getByText(/days? current/i)).toBeVisible();
		await expect(page.getByText(/days? longest/i)).toBeVisible();
	});

	test("reviews per day chart renders", async ({ page }) => {
		await expect(page.getByText("Reviews per Day")).toBeVisible();
		await expect(
			page.locator(".recharts-responsive-container").first(),
		).toBeVisible();
	});

	test("period selector switches data", async ({ page }) => {
		const btn7 = page.getByRole("button", { name: "7 days" });
		const btn30 = page.getByRole("button", { name: "30 days" });
		const btn90 = page.getByRole("button", { name: "90 days" });
		const btnYear = page.getByRole("button", { name: "Year" });

		await expect(btn7).toBeVisible();
		await expect(btn30).toBeVisible();
		await expect(btn90).toBeVisible();
		await expect(btnYear).toBeVisible();

		await btn30.click();
		await expect(
			page.locator(".recharts-responsive-container").first(),
		).toBeVisible();

		await btnYear.click();
		await expect(
			page.locator(".recharts-responsive-container").first(),
		).toBeVisible();
	});

	test("card states chart renders with legend", async ({ page }) => {
		await expect(page.getByText("Card States")).toBeVisible();
		await expect(page.getByText(/total cards?/i)).toBeVisible();
	});

	test("heatmap renders current year", async ({ page }) => {
		const currentYear = new Date().getFullYear().toString();
		await expect(page.getByText(currentYear, { exact: true })).toBeVisible();
		await expect(
			page.locator('[class*="size-\\[13px\\]"]').first(),
		).toBeVisible();
	});

	test("heatmap year navigation", async ({ page }) => {
		const currentYear = new Date().getFullYear();
		const prevBtn = page.getByRole("button", { name: "Previous" });
		const nextBtn = page.getByRole("button", { name: "Next" });

		await expect(nextBtn).toBeDisabled();

		await prevBtn.click();
		await expect(
			page.getByText(String(currentYear - 1), { exact: true }),
		).toBeVisible();
		await expect(nextBtn).toBeEnabled();
	});
});
