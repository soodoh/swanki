import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Separator } from "./separator";

describe("Separator", () => {
	it("defaults to a horizontal separator and supports a vertical override", async () => {
		const screen = await render(
			<div>
				<Separator className="test-separator" />
				<Separator orientation="vertical" />
			</div>,
		);

		const separators = screen.container.querySelectorAll('[role="separator"]');
		await expect.element(separators[0] as Element).toHaveClass(/test-separator/);
		await expect.element(separators[0] as Element).toHaveAttribute("data-slot", "separator");
		await expect
			.element(separators[0] as Element)
			.not.toHaveAttribute("aria-orientation", "vertical");
		await expect.element(separators[1] as Element).toHaveAttribute(
			"aria-orientation",
			"vertical",
		);
	});
});
