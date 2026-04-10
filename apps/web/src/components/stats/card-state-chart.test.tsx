import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CardStateChart } from "./card-state-chart";

const state = vi.hoisted(() => ({
	cardStates: {
		data: undefined as
			| {
					new: number;
					learning: number;
					review: number;
					relearning: number;
			  }
			| undefined,
		isLoading: true,
	},
}));

vi.mock("@/lib/hooks/use-stats", () => ({
	useCardStates: () => state.cardStates,
}));

vi.mock("recharts", () => ({
	Pie: () => null,
	PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ResponsiveContainer: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	Tooltip: () => null,
}));

describe("CardStateChart", () => {
	beforeEach(() => {
		state.cardStates = {
			data: undefined,
			isLoading: true,
		};
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("shows a loading state while the query is pending", async () => {
		const screen = await render(<CardStateChart />);

		await expect.element(screen.getByText("Loading...")).toBeVisible();
	});

	it("shows an empty state when there are no cards", async () => {
		state.cardStates = {
			data: { new: 0, learning: 0, review: 0, relearning: 0 },
			isLoading: false,
		};

		const screen = await render(<CardStateChart />);

		await expect.element(screen.getByText("No cards yet.")).toBeVisible();
		expect(document.body.textContent ?? "").not.toContain("New:");
	});

	it("renders the populated state summary", async () => {
		state.cardStates = {
			data: { new: 2, learning: 1, review: 3, relearning: 0 },
			isLoading: false,
		};

		const screen = await render(<CardStateChart />);

		await expect.element(screen.getByText("New: 2")).toBeVisible();
		await expect.element(screen.getByText("Learning: 1")).toBeVisible();
		await expect.element(screen.getByText("Review: 3")).toBeVisible();
		await expect.element(screen.getByText("6 total cards")).toBeVisible();
		expect(document.body.textContent ?? "").not.toContain("No cards yet.");
		expect(document.body.textContent ?? "").not.toContain("Relearning:");
	});
});
