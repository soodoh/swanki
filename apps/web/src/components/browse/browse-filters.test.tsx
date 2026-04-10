import { useState, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { BrowseFilters } from "./browse-filters";

const browseMocks = vi.hoisted(() => ({
	useDecks: vi.fn(),
	useNoteTypes: vi.fn(),
}));

vi.mock("@/lib/hooks/use-decks", () => ({
	useDecks: browseMocks.useDecks,
}));

vi.mock("@/lib/hooks/use-note-types", () => ({
	useNoteTypes: browseMocks.useNoteTypes,
}));

vi.mock("@/components/ui/select", async () => {
	const React = await import("react");

	type SelectContextValue = {
		open: boolean;
		setOpen: (open: boolean) => void;
		onValueChange: (value: string) => void;
	};

	const SelectContext = React.createContext<SelectContextValue | null>(null);

	return {
		Select: ({
			value,
			onValueChange,
			children,
		}: {
			value: string;
			onValueChange: (value: string) => void;
			children: ReactNode;
		}): ReactElement => {
			const [open, setOpen] = React.useState(false);

			return (
				<SelectContext.Provider
					value={{
						open,
						setOpen,
						onValueChange,
					}}
				>
					<div data-value={value}>{children}</div>
				</SelectContext.Provider>
			);
		},
		SelectTrigger: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement => {
			const context = React.useContext(SelectContext);

			if (!context) {
				throw new Error("SelectTrigger must be used within Select");
			}

			return (
				<button type="button" onClick={() => context.setOpen(!context.open)}>
					{children}
				</button>
			);
		},
		SelectContent: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement | null => {
			const context = React.useContext(SelectContext);

			return context?.open ? <div role="listbox">{children}</div> : null;
		},
		SelectItem: ({
			value,
			children,
		}: {
			value: string;
			children: ReactNode;
		}): ReactElement => {
			const context = React.useContext(SelectContext);

			if (!context) {
				throw new Error("SelectItem must be used within Select");
			}

			return (
				<button
					type="button"
					role="option"
					onClick={() => {
						context.onValueChange(value);
						context.setOpen(false);
					}}
				>
					{children}
				</button>
			);
		},
	};
});

function Harness({
	initialQuery = "",
}: {
	initialQuery?: string;
}): ReactElement {
	const [query, setQuery] = useState(initialQuery);

	return (
		<div className="grid gap-3">
			<BrowseFilters
				searchQuery={query}
				onSearchChange={setQuery}
				notes={[
					{ tags: "verbs grammar" },
					{ tags: "verbs" },
				] as never}
			/>
			<output data-testid="query">{query || "(empty)"}</output>
		</div>
	);
}

describe("BrowseFilters", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		browseMocks.useDecks.mockReturnValue({
			data: [
				{
					id: "deck-spanish",
					name: "Spanish",
					children: [
						{
							id: "deck-spanish-grammar",
							name: "Italian",
							children: [],
						},
					],
				},
			],
		});

		browseMocks.useNoteTypes.mockReturnValue({
			data: [
				{
					noteType: {
						id: "type-basic",
						name: "Basic",
					},
				},
				{
					noteType: {
						id: "type-cloze",
						name: "Cloze",
					},
				},
			],
		});
	});

	it("updates the search query when deck, note type, state, and tag filters are toggled", async () => {
		const screen = await renderWithProviders(<Harness />);

		await expect.element(screen.getByTestId("query")).toHaveTextContent(
			"(empty)",
		);

		await screen.getByText("verbs").click();
		await expect.element(screen.getByTestId("query")).toHaveTextContent(
			"tag:verbs",
		);

		await screen.getByRole("button", { name: "new" }).click();
		await expect.element(screen.getByTestId("query")).toHaveTextContent(
			"tag:verbs is:new",
		);

		await screen.getByRole("button", { name: "All Decks" }).click();
		await screen.getByRole("option", { name: "Spanish" }).click();
		await expect.element(screen.getByTestId("query")).toHaveTextContent(
			"tag:verbs is:new deck:Spanish",
		);

		await screen.getByRole("button", { name: "All Types" }).click();
		await screen.getByRole("option", { name: "Basic" }).click();
		await expect.element(screen.getByTestId("query")).toHaveTextContent(
			"tag:verbs is:new deck:Spanish notetype:Basic",
		);

		await screen.getByRole("button", { name: "Spanish" }).click();
		await screen.getByRole("option", { name: "All Decks" }).click();
		await expect.element(screen.getByTestId("query")).toHaveTextContent(
			"tag:verbs is:new notetype:Basic",
		);
	});
});
