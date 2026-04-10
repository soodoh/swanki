import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "./collapsible";

describe("Collapsible", () => {
	it("renders and updates open content in controlled state", async () => {
		function Harness() {
			const [open, setOpen] = useState(false);

			return (
				<Collapsible open={open} onOpenChange={setOpen}>
					<CollapsibleTrigger>More details</CollapsibleTrigger>
					<CollapsibleContent>Hidden copy</CollapsibleContent>
				</Collapsible>
			);
		}

		const screen = await render(<Harness />);

		const trigger = screen.getByRole("button", { name: "More details" });
		await expect.element(trigger).toHaveAttribute("data-slot", "collapsible-trigger");
		await expect.element(trigger).toHaveAttribute("aria-expanded", "false");

		await trigger.click();

		await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
		await expect.element(screen.getByText("Hidden copy")).toBeVisible();
	});

	it("renders default-open content for the uncontrolled case", async () => {
		const screen = await render(
			<Collapsible defaultOpen>
				<CollapsibleTrigger>More details</CollapsibleTrigger>
				<CollapsibleContent>Hidden copy</CollapsibleContent>
			</Collapsible>,
		);

		await expect.element(screen.getByText("Hidden copy")).toBeVisible();
	});
});
