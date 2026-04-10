import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./dropdown-menu";

describe("DropdownMenu", () => {
	it("renders open content and forwards item handlers", async () => {
		const onRename = vi.fn();
		const screen = await render(
			<DropdownMenu open>
				<DropdownMenuTrigger
					render={<button type="button" aria-label="Actions">Actions</button>}
				/>
				<DropdownMenuContent>
					<DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		await expect.element(screen.getByRole("menuitem", { name: "Rename" })).toBeVisible();
		await screen.getByRole("menuitem", { name: "Rename" }).click();
		expect(onRename).toHaveBeenCalled();
	});
});
