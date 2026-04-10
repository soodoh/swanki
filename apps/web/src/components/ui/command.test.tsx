import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "./command";

describe("Command", () => {
	it("renders the command dialog wrapper and its slotted children", async () => {
		const screen = await render(
			<CommandDialog
				open
				title="Command Palette"
				description="Find something"
				showCloseButton
			>
				<Command>
					<CommandInput placeholder="Search commands" />
					<CommandList>
						<CommandEmpty>No results</CommandEmpty>
						<CommandGroup heading="Navigation">
							<CommandItem value="deck">
								Decks
								<CommandShortcut>⌘K</CommandShortcut>
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</CommandDialog>,
		);

		await expect.element(screen.getByRole("dialog")).toBeVisible();
		await expect.element(screen.getByRole("dialog")).toHaveAccessibleName(
			"Command Palette",
		);
		await expect.element(screen.getByRole("dialog")).toHaveAccessibleDescription(
			"Find something",
		);
		await expect.element(screen.getByPlaceholder("Search commands")).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Close" })).toBeVisible();
		await expect.element(screen.getByText("Decks")).toBeVisible();
		await expect.element(screen.getByText("⌘K")).toBeVisible();
	});
});
