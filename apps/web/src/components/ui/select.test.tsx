import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";

function SelectHarness() {
	const [value, setValue] = useState("English");

	return (
			<Select value={value} onValueChange={setValue}>
			<SelectTrigger aria-label="Language">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="English">English</SelectItem>
				<SelectItem value="Spanish">Spanish</SelectItem>
			</SelectContent>
		</Select>
	);
}

describe("Select", () => {
	it("renders the selected value and open list in controlled state", async () => {
		const screen = await render(<SelectHarness />);

		await expect.element(screen.getByLabelText("Language")).toBeVisible();
		const trigger = screen.container.querySelector('[data-slot="select-trigger"]');
		expect(trigger?.textContent).toContain("English");
	});
});
