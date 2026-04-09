import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { RatingButtons } from "./rating-buttons";

describe("RatingButtons", () => {
	it("renders all four rating buttons with labels", async () => {
		const screen = await render(
			<RatingButtons previews={undefined} disabled={false} onRate={() => {}} />,
		);

		await expect.element(screen.getByText("Again")).toBeVisible();
		await expect.element(screen.getByText("Hard")).toBeVisible();
		await expect.element(screen.getByText("Good")).toBeVisible();
		await expect.element(screen.getByText("Easy")).toBeVisible();
	});

	it("displays formatted interval previews", async () => {
		const previews = {
			1: {
				rating: 1,
				due: "2026-01-01",
				stability: 0,
				difficulty: 0,
				state: 0,
				scheduledDays: 0.00694,
			}, // ~10 minutes
			2: {
				rating: 2,
				due: "2026-01-01",
				stability: 0,
				difficulty: 0,
				state: 0,
				scheduledDays: 0.125,
			}, // 3 hours
			3: {
				rating: 3,
				due: "2026-01-01",
				stability: 0,
				difficulty: 0,
				state: 0,
				scheduledDays: 4,
			}, // 4 days
			4: {
				rating: 4,
				due: "2026-01-01",
				stability: 0,
				difficulty: 0,
				state: 0,
				scheduledDays: 45,
			}, // ~1.5 months
		};

		const screen = await render(
			<RatingButtons previews={previews} disabled={false} onRate={() => {}} />,
		);

		await expect.element(screen.getByText("10m")).toBeVisible();
		await expect.element(screen.getByText("3h")).toBeVisible();
		await expect.element(screen.getByText("4d")).toBeVisible();
		await expect.element(screen.getByText("2mo")).toBeVisible();
	});

	it("fires onRate with the correct rating value on click", async () => {
		const onRate = vi.fn();

		const screen = await render(
			<RatingButtons previews={undefined} disabled={false} onRate={onRate} />,
		);

		await screen.getByText("Good").click();
		expect(onRate).toHaveBeenCalledWith(3);

		await screen.getByText("Again").click();
		expect(onRate).toHaveBeenCalledWith(1);
	});

	it("disables buttons when disabled prop is true", async () => {
		const onRate = vi.fn();

		const screen = await render(
			<RatingButtons previews={undefined} disabled={true} onRate={onRate} />,
		);

		// All buttons should have the disabled attribute
		const buttons = screen.getByRole("button");
		const allButtons = buttons.all();
		for (const button of allButtons) {
			await expect.element(button).toBeDisabled();
		}
	});
});
