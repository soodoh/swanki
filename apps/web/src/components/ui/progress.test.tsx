import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Progress, ProgressLabel, ProgressValue } from "./progress";

describe("Progress", () => {
	it("renders the label, value, and progressbar state", async () => {
		const screen = await render(
			<Progress value={42}>
				<ProgressLabel>Downloading</ProgressLabel>
				<ProgressValue>42%</ProgressValue>
			</Progress>,
		);

		await expect.element(screen.getByText("Downloading")).toBeVisible();
		await expect.element(screen.getByText("42%")).toBeVisible();
		const progressbar = screen.getByRole("progressbar");
		await expect.element(progressbar).toHaveAttribute("data-slot", "progress");
		await expect.element(progressbar).toHaveAttribute("aria-valuenow", "42");
	});
});
