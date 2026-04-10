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
		<div>
			<Select open modal={false} value={value} onValueChange={setValue}>
				<SelectTrigger aria-label="Language">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="English">English</SelectItem>
					<SelectItem value="Spanish">Spanish</SelectItem>
				</SelectContent>
			</Select>
			<output aria-label="Selected language">{value}</output>
		</div>
	);
}

describe("Select", () => {
	it("renders the selected value and open list in controlled state", async () => {
		const screen = await render(<SelectHarness />);

		await expect.element(screen.getByRole("combobox", { name: "Language" })).toBeVisible();
		await expect.element(screen.getByLabelText("Selected language")).toHaveTextContent(
			"English",
		);
		await expect.element(screen.getByRole("option", { name: "Spanish" })).toBeVisible();
		await screen.getByRole("option", { name: "Spanish" }).click();
		await expect.element(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent(
			"Spanish",
		);
		await expect.element(screen.getByLabelText("Selected language")).toHaveTextContent(
			"Spanish",
		);
	});
});
