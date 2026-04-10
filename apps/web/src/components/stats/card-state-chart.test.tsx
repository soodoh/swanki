import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CardStateChart } from "./card-state-chart";

const cardStateMocks = vi.hoisted(() => ({
	useCardStates: vi.fn(),
}));

vi.mock("@/lib/hooks/use-stats", () => ({
	useCardStates: cardStateMocks.useCardStates,
}));

describe("CardStateChart", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders the loading state", async () => {
		cardStateMocks.useCardStates.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		const screen = await renderWithProviders(<CardStateChart />);

		await expect.element(screen.getByText("Loading...")).toBeVisible();
	});

	it("renders the empty state when there are no cards yet", async () => {
		cardStateMocks.useCardStates.mockReturnValue({
			data: {
				new: 0,
				learning: 0,
				review: 0,
				relearning: 0,
			},
			isLoading: false,
		});

		const screen = await renderWithProviders(<CardStateChart />);

		await expect.element(screen.getByText("No cards yet.")).toBeVisible();
	});

	it("renders non-zero legend entries and totals for populated card states", async () => {
		cardStateMocks.useCardStates.mockReturnValue({
			data: {
				new: 4,
				learning: 2,
				review: 7,
				relearning: 0,
			},
			isLoading: false,
		});

		const screen = await renderWithProviders(<CardStateChart />);

		await expect.element(screen.getByText(/New:/)).toBeVisible();
		await expect.element(screen.getByText(/Learning:/)).toBeVisible();
		await expect.element(screen.getByText(/Review:/)).toBeVisible();
		await expect.element(screen.getByText("13 total cards")).toBeVisible();
		expect(document.body.textContent ?? "").not.toContain("Relearning:");
	});
});
