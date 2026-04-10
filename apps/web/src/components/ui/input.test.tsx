import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Input } from "./input";

describe("Input", () => {
	it("renders a text field with forwarded attributes", async () => {
		const screen = await render(
			<Input
				placeholder="Search"
				defaultValue="deck"
				disabled
				aria-label="Search"
				className="test-input"
			/>,
		);

		const input = screen.getByRole("textbox", { name: "Search" });
		await expect.element(input).toHaveAttribute("data-slot", "input");
		await expect.element(input).toHaveValue("deck");
		await expect.element(input).toHaveAttribute("disabled", "");
		await expect.element(input).toHaveClass(/test-input/);
	});
});
