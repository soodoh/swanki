import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Textarea } from "./textarea";

describe("Textarea", () => {
	it("renders a multiline field with forwarded props", async () => {
		const screen = await render(
			<Textarea aria-label="Notes" className="test-textarea" defaultValue="hello" />,
		);

		const textarea = screen.getByRole("textbox", { name: "Notes" });
		const element = screen.container.querySelector('[data-slot="textarea"]') as HTMLTextAreaElement;
		await expect.element(textarea).toHaveAttribute("data-slot", "textarea");
		await expect.element(textarea).toHaveValue("hello");
		expect(element.className).toContain("test-textarea");
	});
});
