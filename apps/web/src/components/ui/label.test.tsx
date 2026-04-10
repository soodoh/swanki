import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Input } from "./input";
import { Label } from "./label";

describe("Label", () => {
	it("associates with a control and transfers focus through the label", async () => {
		const screen = await render(
			<div>
				<Label htmlFor="deck-name">Deck name</Label>
				<Input id="deck-name" defaultValue="Spanish" />
			</div>,
		);

		const label = screen.getByText("Deck name");
		const input = screen.getByLabelText("Deck name");

		await expect.element(label).toHaveAttribute("for", "deck-name");
		await expect.element(input).toHaveValue("Spanish");
		await label.click();
		expect(document.activeElement).toBe(screen.container.querySelector("#deck-name"));
	});
});
