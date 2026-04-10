import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { renderWithProviders } from "@/__tests__/browser/render";
import { NoteEditorDialog } from "./note-editor-dialog";

const noteEditorMocks = vi.hoisted(() => ({
	useDecks: vi.fn(),
	useDeleteNote: vi.fn(),
	useNoteDetail: vi.fn(),
	useNoteType: vi.fn(),
	useUpdateNote: vi.fn(),
	useUpdateNoteType: vi.fn(),
	updateNote: {
		mutateAsync: vi.fn(),
		mutate: vi.fn(),
		isPending: false,
	},
	deleteNote: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
	updateNoteType: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
}));

vi.mock("@/lib/hooks/use-browse", () => ({
	useDeleteNote: noteEditorMocks.useDeleteNote,
	useNoteDetail: noteEditorMocks.useNoteDetail,
	useUpdateNote: noteEditorMocks.useUpdateNote,
}));

vi.mock("@/lib/hooks/use-decks", () => ({
	useDecks: noteEditorMocks.useDecks,
}));

vi.mock("@/lib/hooks/use-note-types", () => ({
	useNoteType: noteEditorMocks.useNoteType,
	useUpdateNoteType: noteEditorMocks.useUpdateNoteType,
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

vi.mock("@/components/ui/tabs", async () => {
	const React = await import("react");

	type TabsContextValue = {
		value: string;
		setValue: (value: string) => void;
	};

	const TabsContext = React.createContext<TabsContextValue | null>(null);

	return {
		Tabs: ({
			children,
			defaultValue,
		}: {
			children: ReactNode;
			defaultValue?: string;
		}): ReactElement => {
			const [value, setValue] = React.useState(defaultValue ?? "");

			return (
				<TabsContext.Provider value={{ value, setValue }}>
					<div>{children}</div>
				</TabsContext.Provider>
			);
		},
		TabsList: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement => <div>{children}</div>,
		TabsTrigger: ({
			value,
			children,
		}: {
			value: string;
			children: ReactNode;
		}): ReactElement => {
			const context = React.useContext(TabsContext);

			if (!context) {
				throw new Error("TabsTrigger must be used within Tabs");
			}

			return (
				<button type="button" onClick={() => context.setValue(value)}>
					{children}
				</button>
			);
		},
		TabsContent: ({
			value,
			children,
		}: {
			value: string;
			children: ReactNode;
		}): ReactElement | null => {
			const context = React.useContext(TabsContext);

			return context?.value === value ? <div>{children}</div> : null;
		},
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
		DialogContent: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement | null => {
			const context = React.useContext(DialogContext);

			return context?.open ? <div>{children}</div> : null;
		},
		DialogHeader: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement => <div>{children}</div>,
		DialogTitle: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement => <h2>{children}</h2>,
		DialogDescription: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement => <p>{children}</p>,
		DialogFooter: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement => <div>{children}</div>,
	};
});

vi.mock("@/components/browse/field-attachments", () => ({
	FieldAttachments: ({
		fieldValue,
	}: {
		fieldValue: string;
	}): ReactElement => <div>{`Attachment:${fieldValue}`}</div>,
	isMediaOnlyField: (value: string) => value.startsWith("[") && value.endsWith("]"),
}));

vi.mock("@/components/template-code-editor", () => ({
	TemplateCodeEditor: (): ReactElement => <div>TemplateEditor</div>,
}));

vi.mock("@/components/css-code-editor", () => ({
	CssCodeEditor: (): ReactElement => <div>CssEditor</div>,
}));

vi.mock("@/components/note-type-editor-tabs", () => ({
	FieldsTab: ({
		fields,
	}: {
		fields: Array<{ name: string }>;
	}): ReactElement => (
		<p>{`FieldsTab:${fields.map((field) => field.name).join("|")}`}</p>
	),
	CardsTab: ({
		fieldNames,
	}: {
		fieldNames: string[];
	}): ReactElement => <p>{`CardsTab:${fieldNames.join("|")}`}</p>,
}));

describe("NoteEditorDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		noteEditorMocks.useUpdateNote.mockReturnValue(noteEditorMocks.updateNote);
		noteEditorMocks.useDeleteNote.mockReturnValue(noteEditorMocks.deleteNote);
		noteEditorMocks.useUpdateNoteType.mockReturnValue(
			noteEditorMocks.updateNoteType,
		);
		noteEditorMocks.updateNote.mutateAsync.mockResolvedValue(undefined);
		noteEditorMocks.deleteNote.mutateAsync.mockResolvedValue(undefined);

		noteEditorMocks.useDecks.mockReturnValue({
			data: [
				{
					id: "1",
					name: "Spanish",
					children: [],
				},
				{
					id: "2",
					name: "French",
					children: [],
				},
			],
		});

		noteEditorMocks.useNoteType.mockReturnValue({
			data: {
				noteType: {
					id: "note-type-1",
					name: "Basic",
					fields: [
						{ name: "Front", ordinal: 0 },
						{ name: "Back", ordinal: 1 },
					],
					css: "",
				},
				templates: [],
			},
			isLoading: false,
			error: null,
		});
	});

	it("shows a loading state while the note detail query is pending", async () => {
		noteEditorMocks.useNoteDetail.mockReturnValue({
			data: undefined,
			isLoading: true,
			error: null,
		});

		const screen = await renderWithProviders(
			<NoteEditorDialog noteId="note-1" open={true} onOpenChange={() => {}} />,
		);

		await expect.element(screen.getByText("Loading note...")).toBeVisible();
	});

	it("shows an error state when the note detail query fails", async () => {
		noteEditorMocks.useNoteDetail.mockReturnValue({
			data: undefined,
			isLoading: false,
			error: new Error("boom"),
		});

		const screen = await renderWithProviders(
			<NoteEditorDialog noteId="note-1" open={true} onOpenChange={() => {}} />,
		);

		await expect
			.element(screen.getByText("Failed to load note."))
			.toBeVisible();
	});

	it("loads note data into the editor and saves edited fields", async () => {
		noteEditorMocks.useNoteDetail.mockReturnValue({
			data: {
				note: {
					id: "note-1",
					userId: "user-1",
					noteTypeId: "note-type-1",
					fields: {
						Front: "hola",
						Back: "adios",
					},
					tags: undefined,
					createdAt: "2026-04-09T12:00:00.000Z",
					updatedAt: "2026-04-09T12:00:00.000Z",
				},
				noteType: {
					id: "note-type-1",
					name: "Basic",
					fields: "[]",
					css: "",
				},
				templates: [],
				deckName: "Spanish",
				deckId: "1",
			},
			isLoading: false,
			error: null,
		});

		const screen = await renderWithProviders(
			<NoteEditorDialog noteId="note-1" open={true} onOpenChange={() => {}} />,
		);

		await expect
			.element(screen.getByRole("heading", { name: "Edit Note" }))
			.toBeVisible();
		await expect.element(screen.getByText("Spanish")).toBeVisible();
		await expect.element(screen.getByLabelText("Front")).toHaveValue("hola");
		await expect.element(screen.getByLabelText("Back")).toHaveValue("adios");

		await screen.getByRole("button", { name: "Fields" }).click();
		await expect.element(screen.getByText("FieldsTab:Front|Back")).toBeVisible();

		await screen.getByText("Note", { exact: true }).click();
		await screen.getByLabelText("Front").fill("hola mundo");
		await screen.getByRole("button", { name: "Save Changes" }).click();

		expect(noteEditorMocks.updateNote.mutateAsync).toHaveBeenCalledWith({
			noteId: "note-1",
			fields: {
				Front: "hola mundo",
				Back: "adios",
			},
			deckId: 1,
		});
	});
});
