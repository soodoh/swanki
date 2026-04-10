import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
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

vi.mock("cmdk", () => {
	const CommandRoot = ({ children, ...props }: { children: ReactNode }) => (
		<div {...props}>{children}</div>
	);
	CommandRoot.Input = (props: Record<string, unknown>) => <input {...props} />;
	CommandRoot.List = ({ children, ...props }: { children: ReactNode }) => (
		<div {...props}>{children}</div>
	);
	CommandRoot.Empty = ({ children, ...props }: { children: ReactNode }) => (
		<div {...props}>{children}</div>
	);
	CommandRoot.Group = ({ children, ...props }: { children: ReactNode }) => (
		<div {...props}>{children}</div>
	);
	CommandRoot.Separator = (props: Record<string, unknown>) => <hr {...props} />;
	CommandRoot.Item = ({ children, ...props }: { children: ReactNode }) => (
		<div role="option" {...props}>
			{children}
		</div>
	);
	CommandRoot.ItemIndicator = ({ children }: { children: ReactNode }) => (
		<>{children}</>
	);

	return { Command: CommandRoot };
});

describe("Command", () => {
	it("renders the command dialog, items, and close button", async () => {
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
		await expect.element(screen.getByPlaceholder("Search commands")).toBeVisible();
		await expect.element(screen.getByText("Decks")).toBeVisible();
		await expect.element(screen.getByText("⌘K")).toBeVisible();

		await screen.getByRole("button", { name: "Close" }).click({ force: true });

		expect(screen.container.querySelector('[data-slot="dialog-content"]')).toBeNull();
	});
});
