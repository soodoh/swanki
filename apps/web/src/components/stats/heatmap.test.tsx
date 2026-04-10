import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ReviewHeatmap } from "./heatmap";

const state = vi.hoisted(() => ({
	heatmap: {
		data: undefined as Record<string, number> | undefined,
		isLoading: true,
	},
}));

vi.mock("@/lib/hooks/use-stats", () => ({
	useHeatmap: () => state.heatmap,
}));

describe("ReviewHeatmap", () => {
	beforeEach(() => {
		state.heatmap = {
			data: undefined,
			isLoading: true,
		};
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("shows a loading state while the query is pending", async () => {
		const screen = await render(<ReviewHeatmap year={2026} />);

		await expect.element(screen.getByText("Loading...")).toBeVisible();
	});

	it("shows an empty state when there is no activity", async () => {
		state.heatmap = {
			data: {},
			isLoading: false,
		};

		const screen = await render(<ReviewHeatmap year={2026} />);

		await expect
			.element(screen.getByText("No review activity yet."))
			.toBeVisible();
		expect(document.body.textContent ?? "").not.toContain("Less");
	});

	it("renders the populated heatmap legend and labels", async () => {
		state.heatmap = {
			data: {
				"2026-01-01": 1,
				"2026-01-02": 2,
				"2026-01-07": 4,
			},
			isLoading: false,
		};

		const screen = await render(<ReviewHeatmap year={2026} />);

		await expect.element(screen.getByText("Jan")).toBeVisible();
		await expect.element(screen.getByText("Mon")).toBeVisible();
		await expect.element(screen.getByText("Wed")).toBeVisible();
		await expect.element(screen.getByText("Less")).toBeVisible();
		await expect.element(screen.getByText("More")).toBeVisible();
		expect(document.body.textContent ?? "").not.toContain(
			"No review activity yet.",
		);
	});
});
