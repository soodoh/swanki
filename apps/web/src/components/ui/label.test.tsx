import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Input } from "./input";
import { Label } from "./label";

describe("Label", () => {
	it("associates with a control and forwards label attributes", async () => {
		const screen = await render(
			<div>
				<Label htmlFor="deck-name">Deck name</Label>
				<Input id="deck-name" defaultValue="Spanish" />
			</div>,
		);

		const label = screen.getByText("Deck name");
		await expect.element(label).toHaveAttribute("data-slot", "label");
		await expect.element(label).toHaveAttribute("for", "deck-name");
		await expect.element(screen.getByLabelText("Deck name")).toHaveValue("Spanish");
	});
});
