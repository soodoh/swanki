import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { ReviewHeatmap } from "./heatmap";

const heatmapMocks = vi.hoisted(() => ({
	useHeatmap: vi.fn(),
}));

vi.mock("@/lib/hooks/use-stats", () => ({
	useHeatmap: heatmapMocks.useHeatmap,
}));

describe("ReviewHeatmap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders the loading state", async () => {
		heatmapMocks.useHeatmap.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		const screen = await renderWithProviders(<ReviewHeatmap year={2026} />);

		await expect.element(screen.getByText("Loading...")).toBeVisible();
	});

	it("renders month labels and the activity legend for supplied review data", async () => {
		heatmapMocks.useHeatmap.mockReturnValue({
			data: {
				"2026-01-05": 2,
				"2026-04-09": 8,
				"2026-12-31": 1,
			},
			isLoading: false,
		});

		const screen = await renderWithProviders(<ReviewHeatmap year={2026} />);

		await expect.element(screen.getByText("Review Activity (2026)")).toBeVisible();
		await expect.element(screen.getByText("Jan")).toBeVisible();
		await expect.element(screen.getByText("Apr")).toBeVisible();
		await expect.element(screen.getByText("Dec")).toBeVisible();
		await expect.element(screen.getByText("Less")).toBeVisible();
		await expect.element(screen.getByText("More")).toBeVisible();
	});
});
