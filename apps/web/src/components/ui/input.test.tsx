import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Input } from "./input";

describe("Input", () => {
	it("renders a text field with forwarded attributes and classes", async () => {
		const screen = await render(
			<Input placeholder="Search" className="max-w-xs" defaultValue="deck" />,
		);

		const input = screen.getByPlaceholder("Search");
		const element = screen.container.querySelector('[data-slot="input"]') as HTMLInputElement;
		await expect.element(input).toHaveAttribute("data-slot", "input");
		await expect.element(input).toHaveValue("deck");
		expect(element.className).toContain("max-w-xs");
		expect(element.className).toContain("border-input");
	});
});
