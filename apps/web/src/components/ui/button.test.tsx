import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Button } from "./button";

describe("Button", () => {
	it("renders its children and forwards native props", async () => {
		const screen = await render(
			<Button type="submit" disabled className="test-button">
				Save
			</Button>,
		);

		const button = screen.getByRole("button", { name: "Save" });
		await expect.element(button).toHaveAttribute("type", "submit");
		await expect.element(button).toHaveAttribute("disabled", "");
		await expect.element(button).toHaveAttribute("data-slot", "button");
		await expect.element(button).toHaveClass(/test-button/);
	});
});
