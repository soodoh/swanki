import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "./sheet";

describe("Sheet", () => {
	it("renders the trigger contract and responds to controlled open state", async () => {
		const renderSheet = (open: boolean) => (
			<Sheet open={open} onOpenChange={vi.fn()}>
				<SheetTrigger render={<button type="button">Open sheet</button>} />
				<SheetContent side="left">
					<SheetHeader>
						<SheetTitle>Filters</SheetTitle>
						<SheetDescription>Refine the list.</SheetDescription>
					</SheetHeader>
				</SheetContent>
			</Sheet>
		);

		const screen = await render(renderSheet(false));

		await expect.element(screen.getByRole("button", { name: "Open sheet" })).toHaveAttribute(
			"data-slot",
			"sheet-trigger",
		);
		expect(document.body.textContent ?? "").not.toContain("Filters");

		await screen.rerender(renderSheet(true));

		await expect.element(screen.getByRole("dialog")).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Close" })).toBeVisible();
		await expect.element(screen.getByText("Filters")).toBeVisible();
		await expect.element(screen.getByText("Refine the list.")).toBeVisible();
	});
});
