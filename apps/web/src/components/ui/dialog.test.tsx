import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./dialog";

describe("Dialog", () => {
	it("renders open content and responds to controlled state changes", async () => {
		const screen = await render(
			<Dialog open>
				<DialogTrigger render={<button type="button">Open dialog</button>} />
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Settings</DialogTitle>
						<DialogDescription>Update your preferences.</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		await expect.element(screen.getByRole("dialog")).toBeVisible();
		await expect.element(screen.getByText("Settings")).toBeVisible();
		await expect.element(screen.getByText("Update your preferences.")).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Close" })).toBeVisible();
	});
});
