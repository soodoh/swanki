import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { ReviewChart } from "./review-chart";

const reviewChartMocks = vi.hoisted(() => ({
	useReviewsPerDay: vi.fn(),
}));

vi.mock("@/lib/hooks/use-stats", () => ({
	useReviewsPerDay: reviewChartMocks.useReviewsPerDay,
}));

describe("ReviewChart", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders the loading state", async () => {
		reviewChartMocks.useReviewsPerDay.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		const screen = await renderWithProviders(<ReviewChart days={7} />);

		await expect.element(screen.getByText("Loading...")).toBeVisible();
	});

	it("renders the empty state when no review data exists", async () => {
		reviewChartMocks.useReviewsPerDay.mockReturnValue({
			data: [],
			isLoading: false,
		});

		const screen = await renderWithProviders(<ReviewChart days={30} />);

		await expect.element(screen.getByText("No review data yet.")).toBeVisible();
	});

	it("renders the populated chart branch for review history", async () => {
		const formattedDate = new Date("2026-04-08T00:00:00").toLocaleDateString(
			undefined,
			{
				month: "short",
				day: "numeric",
			},
		);

		reviewChartMocks.useReviewsPerDay.mockReturnValue({
			data: [
				{ date: "2026-04-08", count: 12 },
				{ date: "2026-04-09", count: 18 },
			],
			isLoading: false,
		});

		const screen = await renderWithProviders(<ReviewChart days={7} />);

		await expect.element(screen.getByText(formattedDate)).toBeVisible();
		expect(document.body.textContent ?? "").not.toContain("No review data yet.");
	});
});
