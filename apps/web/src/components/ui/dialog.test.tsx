import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";

describe("Dialog", () => {
	it("renders the trigger contract and responds to controlled open state", async () => {
		const renderDialog = (open: boolean) => (
			<Dialog open={open} onOpenChange={vi.fn()}>
				<DialogTrigger render={<button type="button">Open dialog</button>} />
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Settings</DialogTitle>
						<DialogDescription>Update your preferences.</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);

		const screen = await render(renderDialog(false));

		await expect.element(screen.getByRole("button", { name: "Open dialog" })).toHaveAttribute(
			"data-slot",
			"dialog-trigger",
		);
		expect(document.body.textContent ?? "").not.toContain("Settings");

		await screen.rerender(renderDialog(true));

		await expect.element(screen.getByRole("dialog")).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Close" })).toBeVisible();
		await expect.element(screen.getByText("Settings")).toBeVisible();
		await expect.element(screen.getByText("Update your preferences.")).toBeVisible();
	});
});
