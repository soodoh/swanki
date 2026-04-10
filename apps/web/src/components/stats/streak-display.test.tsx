import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { StreakDisplay } from "./streak-display";

const state = vi.hoisted(() => ({
	streak: {
		data: undefined as
			| {
					current: number;
					longest: number;
			  }
			| undefined,
		isLoading: true,
	},
}));

vi.mock("@/lib/hooks/use-stats", () => ({
	useStreak: () => state.streak,
}));

describe("StreakDisplay", () => {
	beforeEach(() => {
		state.streak = {
			data: undefined,
			isLoading: true,
		};
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("shows a loading state while the query is pending", async () => {
		const screen = await render(<StreakDisplay />);

		await expect.element(screen.getByText("Loading...")).toBeVisible();
	});

	it("shows an empty state when there is no streak data", async () => {
		state.streak = {
			data: undefined,
			isLoading: false,
		};

		const screen = await render(<StreakDisplay />);

		await expect.element(screen.getByText("No streak yet.")).toBeVisible();
		expect(document.body.textContent ?? "").not.toContain("current");
	});

	it("renders the current and longest streak values", async () => {
		state.streak = {
			data: { current: 12, longest: 30 },
			isLoading: false,
		};

		const screen = await render(<StreakDisplay />);

		await expect.element(screen.getByText("12")).toBeVisible();
		await expect.element(screen.getByText("30")).toBeVisible();
		await expect.element(screen.getByText("days current")).toBeVisible();
		await expect.element(screen.getByText("days longest")).toBeVisible();
		expect(document.body.textContent ?? "").not.toContain("No streak yet.");
	});
});
