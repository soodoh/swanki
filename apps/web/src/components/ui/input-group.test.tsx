import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "./input-group";

describe("InputGroup", () => {
	it("focuses the input when the addon area is clicked", async () => {
		const screen = await render(
			<InputGroup>
				<InputGroupAddon>USD</InputGroupAddon>
				<InputGroupInput aria-label="Amount" />
				<InputGroupButton aria-label="Clear">Clear</InputGroupButton>
			</InputGroup>,
		);

		const input = screen.getByRole("textbox", { name: "Amount" });
		screen.container.querySelector('[data-slot="input-group-addon"]')?.dispatchEvent(
			new MouseEvent("click", { bubbles: true }),
		);
		await expect.element(input).toHaveFocus();
		await expect.element(input).toHaveAttribute("data-slot", "input-group-control");
		const element = screen.container.querySelector('[data-slot="input-group-control"]') as HTMLInputElement;
		expect(element.className).toContain("rounded-none");
	});
});
