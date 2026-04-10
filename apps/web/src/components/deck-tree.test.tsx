import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForwardedRef, ReactElement, ReactNode } from "react";
import { renderWithProviders } from "@/__tests__/browser/render";
import { DeckTree } from "./deck-tree";

const deckTreeMocks = vi.hoisted(() => ({
	useCreateDeck: vi.fn(),
	useDeckCounts: vi.fn(),
	useDeleteDeck: vi.fn(),
	useUpdateDeck: vi.fn(),
	createDeck: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
	deleteDeck: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
	updateDeck: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
}));

vi.mock("@/lib/hooks/use-decks", () => ({
	useCreateDeck: deckTreeMocks.useCreateDeck,
	useDeckCounts: deckTreeMocks.useDeckCounts,
	useDeleteDeck: deckTreeMocks.useDeleteDeck,
	useUpdateDeck: deckTreeMocks.useUpdateDeck,
}));

vi.mock("@dnd-kit/core", () => ({
	DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PointerSensor: function PointerSensor() {},
	useSensor: () => ({}),
	useSensors: () => [],
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
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		className,
		ref,
		...props
	}: {
		children?: ReactNode;
		to: string;
		params?: { deckId?: string };
		className?: string;
		ref?: ForwardedRef<HTMLAnchorElement>;
	}) => {
		const href = params?.deckId
			? to.replace("$deckId", params.deckId)
			: to;
		return (
			<a href={href} className={className} ref={ref} {...props}>
				{children}
			</a>
		);
	},
}));

vi.mock("@/components/ui/dropdown-menu", async () => {
	const React = await import("react");

	type DropdownContextValue = {
		open: boolean;
		setOpen: (open: boolean) => void;
	};

	const DropdownContext = React.createContext<DropdownContextValue | null>(null);

	return {
		DropdownMenu: ({ children }: { children: ReactNode }): ReactElement => {
			const [open, setOpen] = React.useState(false);
			return (
				<DropdownContext.Provider value={{ open, setOpen }}>
					<div>{children}</div>
				</DropdownContext.Provider>
			);
		},
		DropdownMenuTrigger: ({
			render,
		}: {
			render: ReactElement;
		}): ReactElement => {
			const context = React.useContext(DropdownContext);
			if (!context) {
				throw new Error("DropdownMenuTrigger must be used within DropdownMenu");
			}
			return render.type({
				...render.props,
				onClick: () => context.setOpen(!context.open),
			});
		},
		DropdownMenuContent: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement | null => {
			const context = React.useContext(DropdownContext);
			return context?.open ? <div>{children}</div> : null;
		},
		DropdownMenuItem: ({
			children,
			onClick,
		}: {
			children: ReactNode;
			onClick?: () => void;
		}): ReactElement => (
			<button type="button" onClick={onClick}>
				{children}
			</button>
		),
		DropdownMenuSeparator: (): ReactElement => <hr />,
	};
});

vi.mock("@/components/ui/dialog", async () => {
	const React = await import("react");

	type DialogContextValue = {
		open: boolean;
		setOpen: (open: boolean) => void;
	};

	const DialogContext = React.createContext<DialogContextValue | null>(null);

	return {
		Dialog: ({
			children,
			open,
			onOpenChange,
		}: {
			children: ReactNode;
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}): ReactElement => {
			const [internalOpen, setInternalOpen] = React.useState(open ?? false);
			const isOpen = open ?? internalOpen;

			return (
				<DialogContext.Provider
					value={{
						open: isOpen,
						setOpen(nextOpen) {
							onOpenChange?.(nextOpen);
							if (open === undefined) {
								setInternalOpen(nextOpen);
							}
						},
					}}
				>
					{children}
				</DialogContext.Provider>
			);
		},
		DialogTrigger: ({
			render,
		}: {
			render: ReactElement;
		}): ReactElement => {
			const context = React.useContext(DialogContext);
			if (!context) {
				throw new Error("DialogTrigger must be used within Dialog");
			}
			return render.type({
				...render.props,
				onClick: () => context.setOpen(true),
			});
		},
		DialogContent: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement | null => {
			const context = React.useContext(DialogContext);
			return context?.open ? <div>{children}</div> : null;
		},
		DialogDescription: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement => <p>{children}</p>,
		DialogFooter: ({ children }: { children: ReactNode }): ReactElement => (
			<div>{children}</div>
		),
		DialogHeader: ({ children }: { children: ReactNode }): ReactElement => (
			<div>{children}</div>
		),
		DialogTitle: ({ children }: { children: ReactNode }): ReactElement => (
			<h2>{children}</h2>
		),
	};
});

const decks = [
	{
		id: "root",
		userId: "user-1",
		name: "Spanish",
		parentId: undefined,
		description: "",
		settings: { newCardsPerDay: 20, maxReviewsPerDay: 200 },
		createdAt: "2026-04-09T00:00:00.000Z",
		updatedAt: "2026-04-09T00:00:00.000Z",
		children: [
			{
				id: "child",
				userId: "user-1",
				name: "Verbs",
				parentId: "root",
				description: "",
				settings: { newCardsPerDay: 10, maxReviewsPerDay: 100 },
				createdAt: "2026-04-09T00:00:00.000Z",
				updatedAt: "2026-04-09T00:00:00.000Z",
				children: [],
			},
		],
	},
	{
		id: "other",
		userId: "user-1",
		name: "French",
		parentId: undefined,
		description: "",
		settings: { newCardsPerDay: 15, maxReviewsPerDay: 150 },
		createdAt: "2026-04-09T00:00:00.000Z",
		updatedAt: "2026-04-09T00:00:00.000Z",
		children: [],
	},
];

describe("DeckTree", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		deckTreeMocks.useCreateDeck.mockReturnValue(deckTreeMocks.createDeck);
		deckTreeMocks.useDeleteDeck.mockReturnValue(deckTreeMocks.deleteDeck);
		deckTreeMocks.useUpdateDeck.mockReturnValue(deckTreeMocks.updateDeck);
		deckTreeMocks.useDeckCounts.mockReturnValue({
			data: { new: 3, learning: 1, review: 5 },
		});
	});

	it("creates a new deck from the empty state", async () => {
		const screen = await renderWithProviders(<DeckTree decks={[]} />);

		await expect.element(screen.getByText("No decks yet")).toBeVisible();
		await screen
			.getByRole("button", { name: "Add Deck from empty state" })
			.click();
		await screen.getByLabelText("Deck name").fill("Spanish");
		await screen.getByRole("button", { name: "Create Deck" }).click();

		expect(deckTreeMocks.createDeck.mutateAsync).toHaveBeenCalledWith({
			name: "Spanish",
			parentId: undefined,
		});
	});

	it("collapses nested decks and saves deck options with string parent ids", async () => {
		const screen = await renderWithProviders(<DeckTree decks={decks as never} />);

		await expect.element(screen.getByText("Verbs")).toBeVisible();
		await screen
			.getByRole("button", { name: "Collapse deck Spanish" })
			.click();
		expect(document.body.textContent ?? "").not.toContain("Verbs");

		await screen.getByRole("button", { name: "Expand deck Spanish" }).click();
		await expect.element(screen.getByText("Verbs")).toBeVisible();

		await screen
			.getByRole("button", { name: "Deck actions for Spanish" })
			.click();
		await screen.getByRole("button", { name: "Options" }).click();
		await screen.getByLabelText("Name").fill("Spanish Updated");
		await screen.getByLabelText("Parent Deck").selectOptions("other");
		await screen.getByRole("button", { name: "Save" }).click();

		expect(deckTreeMocks.updateDeck.mutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				deckId: "root",
				name: "Spanish Updated",
				parentId: "other",
			}),
		);
	});

	it("confirms destructive delete actions through the action menu", async () => {
		const screen = await renderWithProviders(<DeckTree decks={decks as never} />);

		await screen
			.getByRole("button", { name: "Deck actions for French" })
			.click();
		await screen.getByRole("button", { name: "Delete" }).click();
		await expect.element(screen.getByRole("heading", { name: "Delete Deck" })).toBeVisible();
		await screen
			.getByRole("button", { name: "Confirm delete deck French" })
			.click();

		expect(deckTreeMocks.deleteDeck.mutateAsync).toHaveBeenCalledWith("other");
	});
});
