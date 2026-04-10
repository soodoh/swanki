import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

describe("Tooltip", () => {
	it("shows the portal content when open", async () => {
		const screen = await render(
			<TooltipProvider delay={0}>
				<Tooltip open>
					<TooltipTrigger render={<button type="button">Info</button>} />
					<TooltipContent>Helpful text</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		expect(document.body.querySelector('[data-slot="tooltip-content"]')).toBeTruthy();
		await expect.element(screen.getByText("Helpful text")).toBeVisible();
	});
});
