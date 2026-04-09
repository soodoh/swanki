import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { StudyProgress } from "./study-progress";

describe("StudyProgress", () => {
	it("renders card counts for new, learning, and review", async () => {
		const screen = await render(
			<StudyProgress
				counts={{ new: 5, learning: 3, review: 12 }}
				initialTotal={30}
			/>,
		);

		await expect.element(screen.getByText("5")).toBeVisible();
		await expect.element(screen.getByText("3")).toBeVisible();
		await expect.element(screen.getByText("12")).toBeVisible();
	});

	it("calculates progress bar width correctly", async () => {
		// 30 total, 20 remaining (5+3+12) = 10 done = 33%
		const { container } = await render(
			<StudyProgress
				counts={{ new: 5, learning: 3, review: 12 }}
				initialTotal={30}
			/>,
		);

		const progressBar = container.querySelector("[style*='width']");
		await expect.element(progressBar!).toHaveAttribute("style", "width: 33%;");
	});

	it("shows 0% progress when all cards remain", async () => {
		const { container } = await render(
			<StudyProgress
				counts={{ new: 10, learning: 0, review: 0 }}
				initialTotal={10}
			/>,
		);

		const progressBar = container.querySelector("[style*='width']");
		await expect.element(progressBar!).toHaveAttribute("style", "width: 0%;");
	});

	it("handles zero initialTotal without division error", async () => {
		const { container } = await render(
			<StudyProgress
				counts={{ new: 0, learning: 0, review: 0 }}
				initialTotal={0}
			/>,
		);

		const progressBar = container.querySelector("[style*='width']");
		await expect.element(progressBar!).toHaveAttribute("style", "width: 0%;");
	});
});
