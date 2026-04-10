import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ReviewChart } from "./review-chart";

const state = vi.hoisted(() => ({
	reviews: {
		data: undefined as
			| Array<{
					date: string;
					count: number;
			  }>
			| undefined,
		isLoading: true,
	},
}));

vi.mock("@/lib/hooks/use-stats", () => ({
	useReviewsPerDay: () => state.reviews,
}));

vi.mock("recharts", () => ({
	Bar: () => null,
	BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CartesianGrid: () => null,
	ResponsiveContainer: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	Tooltip: () => null,
	XAxis: () => null,
	YAxis: () => null,
}));

describe("ReviewChart", () => {
	beforeEach(() => {
		state.reviews = {
			data: undefined,
			isLoading: true,
		};
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("shows a loading state while the query is pending", async () => {
		const screen = await render(<ReviewChart days={30} />);

		await expect.element(screen.getByText("Loading...")).toBeVisible();
	});

	it("shows an empty state when there are no reviews", async () => {
		state.reviews = {
			data: [],
			isLoading: false,
		};

		const screen = await render(<ReviewChart days={30} />);

		await expect.element(screen.getByText("No review data yet.")).toBeVisible();
		expect(
			document.body.querySelector('[role="img"][aria-label="Reviews chart"]'),
		).toBeNull();
	});

	it("renders the populated chart container", async () => {
		state.reviews = {
			data: [
				{ date: "2026-01-01", count: 4 },
				{ date: "2026-01-02", count: 2 },
				{ date: "2026-01-03", count: 1 },
			],
			isLoading: false,
		};

		await render(<ReviewChart days={30} />);

		expect(
			document.body.querySelector('[role="img"][aria-label="Reviews chart"]'),
		).not.toBeNull();
		expect(document.body.textContent ?? "").not.toContain(
			"No review data yet.",
		);
	});
});
