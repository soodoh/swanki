import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "./sheet";
import { useState } from "react";

describe("Sheet", () => {
	it("renders the open sheet and responds to controlled state", async () => {
		function Harness() {
			const [open, setOpen] = useState(true);

			return (
				<Sheet open={open} onOpenChange={setOpen}>
					<SheetContent side="left">
						<SheetHeader>
							<SheetTitle>Filters</SheetTitle>
							<SheetDescription>Refine the list.</SheetDescription>
						</SheetHeader>
					</SheetContent>
				</Sheet>
			);
		}

		const screen = await render(
			<Harness />,
		);

		await expect.element(screen.getByRole("dialog")).toBeVisible();
		expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeTruthy();
	});
});
