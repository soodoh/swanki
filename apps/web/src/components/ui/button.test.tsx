import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Button } from "./button";

describe("Button", () => {
	it("renders its children and forwards classes and native props", async () => {
		const screen = await render(
			<Button type="submit" className="w-full">
				Save
			</Button>,
		);

		const button = screen.getByRole("button", { name: "Save" });
		const element = screen.container.querySelector('[data-slot="button"]') as HTMLButtonElement;
		await expect.element(button).toHaveAttribute("type", "submit");
		await expect.element(button).toHaveAttribute("data-slot", "button");
		expect(element.className).toContain("w-full");
		expect(element.className).toContain("bg-primary");
	});
});
