import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { StreakDisplay } from "./streak-display";

const streakMocks = vi.hoisted(() => ({
	useStreak: vi.fn(),
}));

vi.mock("@/lib/hooks/use-stats", () => ({
	useStreak: streakMocks.useStreak,
}));

describe("StreakDisplay", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders the loading state", async () => {
		streakMocks.useStreak.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		const screen = await renderWithProviders(<StreakDisplay />);

		await expect.element(screen.getByText("Loading...")).toBeVisible();
	});

	it("renders current and longest streak values", async () => {
		streakMocks.useStreak.mockReturnValue({
			data: {
				current: 5,
				longest: 12,
			},
			isLoading: false,
		});

		const screen = await renderWithProviders(<StreakDisplay />);

		await expect.element(screen.getByText("5")).toBeVisible();
		await expect.element(screen.getByText("days current")).toBeVisible();
		await expect.element(screen.getByText("12")).toBeVisible();
		await expect.element(screen.getByText("days longest")).toBeVisible();
	});
});
