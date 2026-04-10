import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render } from "vitest-browser-react";
import { DeckTree } from "./deck-tree";

const { createDeck, updateDeck, deleteDeck } = vi.hoisted(() => ({
	createDeck: vi.fn(),
	updateDeck: vi.fn(),
	deleteDeck: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
	DndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
	DragOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
	PointerSensor: function PointerSensor(): void {},
	useDraggable: () => ({
		attributes: {},
		listeners: {},
		setNodeRef: () => {},
		isDragging: false,
	}),
	useDroppable: () => ({
		isOver: false,
		setNodeRef: () => {},
	}),
	useSensor: () => ({}),
	useSensors: () => [],
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to?: string;
		params?: Record<string, string>;
	}) => {
		let href = to ?? "#";
		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

vi.mock("@/lib/hooks/use-decks", () => ({
	useDeckCounts: () => ({
		data: { new: 3, learning: 2, review: 1 },
	}),
	useCreateDeck: () => ({
		mutateAsync: createDeck,
		isPending: false,
	}),
	useUpdateDeck: () => ({
		mutateAsync: updateDeck,
		isPending: false,
	}),
	useDeleteDeck: () => ({
		mutateAsync: deleteDeck,
		isPending: false,
	}),
}));

describe("DeckTree", () => {
	beforeEach(() => {
		createDeck.mockReset();
		updateDeck.mockReset();
		deleteDeck.mockReset();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("renders nested decks and collapses children with the disclosure control", async () => {
		const screen = await render(
			<DeckTree
				decks={[
					{
						id: "deck-spanish",
						userId: "user-1",
						name: "Spanish",
						parentId: undefined,
						description: "",
						settings: undefined,
						createdAt: "2024-01-01T00:00:00.000Z",
						updatedAt: "2024-01-01T00:00:00.000Z",
						children: [
							{
								id: "deck-spanish-child",
								userId: "user-1",
								name: "Spanish Child",
								parentId: "deck-spanish",
								description: "",
								settings: undefined,
								createdAt: "2024-01-01T00:00:00.000Z",
								updatedAt: "2024-01-01T00:00:00.000Z",
								children: [],
							},
						],
					},
				]}
			/>,
		);

		await expect.element(screen.getByRole("link", { name: "Spanish" })).toBeVisible();
		await expect.element(screen.getByRole("link", { name: "Spanish Child" })).toBeVisible();

		await screen.getByRole("button", { name: "Collapse Spanish" }).click();

		expect(screen.queryByRole("link", { name: "Spanish Child" })).toBeNull();
		await expect.element(screen.getByRole("button", { name: "Expand Spanish" })).toBeVisible();
	});

	it("opens the create deck dialog and submits the deck name", async () => {
		const screen = await render(<DeckTree decks={[]} />);

		await screen.getByRole("button", { name: "Add Deck" }).click();
		await expect.element(screen.getByRole("dialog", { name: "Create New Deck" })).toBeVisible();

		await screen.getByRole("textbox", { name: "Deck name" }).fill("German");
		await screen.getByRole("button", { name: "Create Deck" }).click();

		expect(createDeck).toHaveBeenCalledWith({ name: "German", parentId: undefined });
	});

	it("saves deck options using string deck ids", async () => {
		const screen = await render(
			<DeckTree
				decks={[
					{
						id: "deck-spanish",
						userId: "user-1",
						name: "Spanish",
						parentId: undefined,
						description: "",
						settings: undefined,
						createdAt: "2024-01-01T00:00:00.000Z",
						updatedAt: "2024-01-01T00:00:00.000Z",
						children: [
							{
								id: "deck-spanish-child",
								userId: "user-1",
								name: "Spanish Child",
								parentId: "deck-spanish",
								description: "",
								settings: undefined,
								createdAt: "2024-01-01T00:00:00.000Z",
								updatedAt: "2024-01-01T00:00:00.000Z",
								children: [],
							},
						],
					},
				]}
			/>,
		);

		await screen
			.getByRole("button", { name: "Deck options for Spanish Child" })
			.click();
		await screen.getByRole("menuitem", { name: "Options" }).click();

		const parentSelect = screen.getByLabelText("Parent Deck");
		const parentSelectElement = parentSelect as unknown as HTMLSelectElement;
		parentSelectElement.value = "deck-spanish";
		parentSelectElement.dispatchEvent(new Event("change", { bubbles: true }));

		await screen.getByRole("button", { name: "Save" }).click();

		expect(updateDeck).toHaveBeenCalledWith({
			deckId: "deck-spanish-child",
			name: "Spanish Child",
			description: "",
			parentId: "deck-spanish",
			settings: { newCardsPerDay: 20, maxReviewsPerDay: 200 },
		});
	});
});
