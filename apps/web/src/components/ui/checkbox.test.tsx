import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
	it("toggles checked state through the browser interaction", async () => {
		const screen = await render(<Checkbox aria-label="Enable sync" />);

		const checkbox = screen.getByRole("checkbox", { name: "Enable sync" });
		await expect.element(checkbox).toHaveAttribute("data-slot", "checkbox");
		await expect.element(checkbox).toHaveAttribute("aria-checked", "false");
		(screen.container.querySelector('[role="checkbox"]') as HTMLElement).click();
		await expect.element(checkbox).toHaveAttribute("aria-checked", "true");
	});
});
