import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { NoteTypeEditorDialog } from "./note-type-editor-dialog";

const dialogMocks = vi.hoisted(() => ({
	useNoteType: vi.fn(),
	useSampleNote: vi.fn(),
	useUpdateNoteType: vi.fn(),
	updateMutation: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
}));

vi.mock("@/lib/hooks/use-note-types", () => ({
	useNoteType: dialogMocks.useNoteType,
	useSampleNote: dialogMocks.useSampleNote,
	useUpdateNoteType: dialogMocks.useUpdateNoteType,
}));

vi.mock("@/components/note-type-editor-tabs", () => ({
	NameEditor: ({
		name,
		noteTypeId,
	}: {
		name: string;
		noteTypeId: string;
	}): React.ReactElement => (
		<div>{`NameEditor:${name}:${noteTypeId}`}</div>
	),
	FieldsTab: ({
		fields,
	}: {
		fields: Array<{ name: string; ordinal: number }>;
	}): React.ReactElement => (
		<div>{`FieldsTab:${fields.map((field) => field.name).join("|")}`}</div>
	),
	CardsTab: ({
		fieldNames,
		previewFields,
	}: {
		fieldNames: string[];
		previewFields: Record<string, string> | undefined;
	}): React.ReactElement => (
		<div>
			{`CardsTab:${fieldNames.join("|")}:${previewFields?.Front ?? "none"}:${previewFields?.Back ?? "none"}`}
		</div>
	),
}));

vi.mock("@/components/ui/dialog", () => ({
	Dialog: ({
		children,
		open,
	}: {
		children: React.ReactNode;
		open: boolean;
	}): React.ReactElement | null => (open ? <div>{children}</div> : null),
	DialogContent: ({
		children,
	}: {
		children: React.ReactNode;
	}): React.ReactElement => <div>{children}</div>,
	DialogDescription: ({
		children,
	}: {
		children: React.ReactNode;
	}): React.ReactElement => <p>{children}</p>,
	DialogHeader: ({
		children,
	}: {
		children: React.ReactNode;
	}): React.ReactElement => <div>{children}</div>,
	DialogTitle: ({
		children,
	}: {
		children: React.ReactNode;
	}): React.ReactElement => <h2>{children}</h2>,
}));

describe("NoteTypeEditorDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dialogMocks.useUpdateNoteType.mockReturnValue(dialogMocks.updateMutation);
		dialogMocks.useSampleNote.mockReturnValue({
			data: { Front: "hola", Back: "adios" },
		});
	});

	it("shows a loading state while the note type query is pending", async () => {
		dialogMocks.useNoteType.mockReturnValue({
			data: undefined,
			isLoading: true,
			error: null,
		});

		const screen = await renderWithProviders(
			<NoteTypeEditorDialog
				noteTypeId="note-type-1"
				open={true}
				onOpenChange={() => {}}
			/>,
		);

		await expect.element(screen.getByText("Loading note type...")).toBeVisible();
	});

	it("shows an error state when the note type query fails", async () => {
		dialogMocks.useNoteType.mockReturnValue({
			data: undefined,
			isLoading: false,
			error: new Error("boom"),
		});

		const screen = await renderWithProviders(
			<NoteTypeEditorDialog
				noteTypeId="note-type-1"
				open={true}
				onOpenChange={() => {}}
			/>,
		);

		await expect
			.element(screen.getByText("Failed to load note type."))
			.toBeVisible();
	});

	it("renders the note type data state and wires sample note data into the cards tab", async () => {
		dialogMocks.useNoteType.mockReturnValue({
			data: {
				noteType: {
					id: "note-type-1",
					name: "Basic",
					fields: [
						{ name: "Front", ordinal: 0 },
						{ name: "Back", ordinal: 1 },
					],
					css: ".card { color: red; }",
				},
				templates: [
					{
						id: "template-1",
						noteTypeId: "note-type-1",
						name: "Card 1",
						ordinal: 0,
						questionTemplate: "{{Front}}",
						answerTemplate: "{{FrontSide}}<hr>{{Back}}",
					},
				],
			},
			isLoading: false,
			error: null,
		});

		const screen = await renderWithProviders(
			<NoteTypeEditorDialog
				noteTypeId="note-type-1"
				open={true}
				onOpenChange={() => {}}
			/>,
		);

		await expect
			.element(screen.getByRole("heading", { name: "Basic" }))
			.toBeVisible();
		await expect
			.element(screen.getByText("Edit fields, templates, and styling"))
			.toBeVisible();
		await expect
			.element(screen.getByText("NameEditor:Basic:note-type-1"))
			.toBeVisible();
		await expect
			.element(screen.getByText("FieldsTab:Front|Back"))
			.toBeVisible();
		await screen.getByRole("tab", { name: "Cards" }).click();
		await expect
			.element(screen.getByText("CardsTab:Front|Back:hola:adios"))
			.toBeVisible();
	});
});
