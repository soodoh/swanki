import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Separator } from "./separator";

describe("Separator", () => {
	it("renders a vertical separator with the expected accessibility contract", async () => {
		const screen = await render(
			<div>
				<span>Left</span>
				<Separator orientation="vertical" />
				<span>Right</span>
			</div>,
		);

		const separator = screen.getByRole("separator");
		await expect.element(separator).toHaveAttribute("data-slot", "separator");
		await expect.element(separator).toHaveAttribute("aria-orientation", "vertical");
	});
});
