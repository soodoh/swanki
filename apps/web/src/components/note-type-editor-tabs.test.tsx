import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CardsTab, FieldsTab } from "./note-type-editor-tabs";

const tabsMocks = vi.hoisted(() => ({
	createTemplate: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
	updateTemplate: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
	deleteTemplate: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
	useCreateTemplate: vi.fn(),
	useUpdateTemplate: vi.fn(),
	useDeleteTemplate: vi.fn(),
}));

vi.mock("@/lib/hooks/use-note-types", async () => {
	const actual = await vi.importActual<typeof import("@/lib/hooks/use-note-types")>(
		"@/lib/hooks/use-note-types",
	);

	return {
		...actual,
		useCreateTemplate: tabsMocks.useCreateTemplate,
		useUpdateTemplate: tabsMocks.useUpdateTemplate,
		useDeleteTemplate: tabsMocks.useDeleteTemplate,
	};
});

vi.mock("@/components/css-code-editor", () => ({
	CssCodeEditor: ({
		value,
		onChange,
	}: {
		value: string;
		onChange: (value: string) => void;
	}): React.ReactElement => (
		<textarea
			aria-label="CSS code editor"
			value={value}
			onInput={(event) => onChange(event.currentTarget.value)}
			readOnly={false}
		/>
	),
}));

vi.mock("@/components/template-code-editor", () => ({
	TemplateCodeEditor: ({
		value,
		onChange,
		isAnswerTemplate,
	}: {
		value: string;
		onChange: (value: string) => void;
		isAnswerTemplate?: boolean;
	}): React.ReactElement => (
		<textarea
			aria-label={isAnswerTemplate ? "Answer template editor" : "Question template editor"}
			value={value}
			onInput={(event) => onChange(event.currentTarget.value)}
			readOnly={false}
		/>
	),
}));

vi.mock("@/components/ui/dialog", () => {
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
			children: React.ReactNode;
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}): React.ReactElement => {
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
			render: React.ReactElement;
		}): React.ReactElement => {
			const context = React.useContext(DialogContext);

			if (!context) {
				throw new Error("DialogTrigger must be used within Dialog");
			}

			return React.cloneElement(render, {
				onClick: () => context.setOpen(true),
			});
		},
		DialogContent: ({
			children,
		}: {
			children: React.ReactNode;
		}): React.ReactElement | null => {
			const context = React.useContext(DialogContext);

			return context?.open ? <div>{children}</div> : null;
		},
		DialogDescription: ({
			children,
		}: {
			children: React.ReactNode;
		}): React.ReactElement => <p>{children}</p>,
		DialogFooter: ({
			children,
		}: {
			children: React.ReactNode;
		}): React.ReactElement => <div>{children}</div>,
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
	};
});

describe("note-type-editor-tabs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tabsMocks.useCreateTemplate.mockReturnValue(tabsMocks.createTemplate);
		tabsMocks.useUpdateTemplate.mockReturnValue(tabsMocks.updateTemplate);
		tabsMocks.useDeleteTemplate.mockReturnValue(tabsMocks.deleteTemplate);
	});

	it("shows field rows and saves edited fields", async () => {
		const onSave = {
			mutateAsync: vi.fn(),
			isPending: false,
		};

		const screen = await renderWithProviders(
			<FieldsTab
				fields={[
					{ name: "Front", ordinal: 0 },
					{ name: "Back", ordinal: 1 },
				]}
				noteTypeId="note-type-1"
				onSave={onSave as never}
			/>,
		);

		await expect.element(screen.getByText("Front")).toBeVisible();
		await expect.element(screen.getByText("Back")).toBeVisible();
		await expect
			.element(screen.getByRole("button", { name: "Save Fields" }))
			.toBeDisabled();

		await screen.getByPlaceholder("New field name").fill("Hint");
		await screen.getByRole("button", { name: "Add" }).click();

		await expect.element(screen.getByText("Hint")).toBeVisible();
		await expect
			.element(screen.getByRole("button", { name: "Save Fields" }))
			.toBeEnabled();

		await screen.getByRole("button", { name: "Save Fields" }).click();

		expect(onSave.mutateAsync).toHaveBeenCalledWith({
			id: "note-type-1",
			fields: [
				{ name: "Front", ordinal: 0 },
				{ name: "Back", ordinal: 1 },
				{ name: "Hint", ordinal: 2 },
			],
		});
	});

	it("enables the CSS save affordance only after the CSS changes", async () => {
		const onSaveCss = {
			mutateAsync: vi.fn(),
			isPending: false,
		};

		const screen = await renderWithProviders(
			<CardsTab
				templates={[
					{
						id: "template-1",
						noteTypeId: "note-type-1",
						name: "Card 1",
						ordinal: 0,
						questionTemplate: "{{Front}}",
						answerTemplate: "{{FrontSide}}<hr>{{Back}}",
					},
				]}
				noteTypeId="note-type-1"
				css=".card { color: red; }"
				fieldNames={["Front", "Back"]}
				previewFields={{ Front: "Hola", Back: "Adios" }}
				onSaveCss={onSaveCss as never}
			/>,
		);

		await screen.getByRole("button", { name: "Custom CSS" }).click();

		const saveButton = screen.getByRole("button", { name: "Save CSS" });
		await expect.element(saveButton).toBeDisabled();

		await screen.getByLabelText("CSS code editor").fill(".card { color: blue; }");
		await expect.element(saveButton).toBeEnabled();

		await saveButton.click();

		expect(onSaveCss.mutateAsync).toHaveBeenCalledWith({
			id: "note-type-1",
			css: ".card { color: blue; }",
		});
	});

	it("creates a new template from the add-template dialog", async () => {
		tabsMocks.createTemplate.mutateAsync.mockResolvedValue({
			id: "template-2",
		});

		const screen = await renderWithProviders(
			<CardsTab
				templates={[
					{
						id: "template-1",
						noteTypeId: "note-type-1",
						name: "Card 1",
						ordinal: 0,
						questionTemplate: "{{Front}}",
						answerTemplate: "{{FrontSide}}<hr>{{Back}}",
					},
				]}
				noteTypeId="note-type-1"
				css=".card { color: red; }"
				fieldNames={["Front", "Back"]}
				previewFields={{ Front: "Hola", Back: "Adios" }}
				onSaveCss={
					{
						mutateAsync: vi.fn(),
						isPending: false,
					} as never
				}
			/>,
		);

		await screen.getByRole("button", { name: "Add Template" }).click();
		const templateName = screen.getByLabelText("Template Name");
		await templateName.fill("Reverse");
		templateName.element().dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Enter",
				bubbles: true,
			}),
		);

		expect(tabsMocks.createTemplate.mutateAsync).toHaveBeenCalledWith({
			noteTypeId: "note-type-1",
			name: "Reverse",
			questionTemplate: "{{Front}}",
			answerTemplate: "{{FrontSide}}<hr>{{Back}}",
		});
	});

	it("saves edited template content for the expanded template", async () => {
		const screen = await renderWithProviders(
			<CardsTab
				templates={[
					{
						id: "template-1",
						noteTypeId: "note-type-1",
						name: "Card 1",
						ordinal: 0,
						questionTemplate: "{{Front}}",
						answerTemplate: "{{FrontSide}}<hr>{{Back}}",
					},
				]}
				noteTypeId="note-type-1"
				css=".card { color: red; }"
				fieldNames={["Front", "Back"]}
				previewFields={{ Front: "Hola", Back: "Adios" }}
				onSaveCss={
					{
						mutateAsync: vi.fn(),
						isPending: false,
					} as never
				}
			/>,
		);

		await screen
			.getByLabelText("Question template editor")
			.fill("<div>Question: {{Front}}</div>");
		await screen.getByRole("button", { name: "Save Template" }).click();

		expect(tabsMocks.updateTemplate.mutateAsync).toHaveBeenCalledWith({
			templateId: "template-1",
			noteTypeId: "note-type-1",
			questionTemplate: "<div>Question: {{Front}}</div>",
			answerTemplate: "{{FrontSide}}<hr>{{Back}}",
		});
	});

	it("deletes a template when deletion is allowed", async () => {
		const screen = await renderWithProviders(
			<CardsTab
				templates={[
					{
						id: "template-1",
						noteTypeId: "note-type-1",
						name: "Card 1",
						ordinal: 0,
						questionTemplate: "{{Front}}",
						answerTemplate: "{{FrontSide}}<hr>{{Back}}",
					},
					{
						id: "template-2",
						noteTypeId: "note-type-1",
						name: "Card 2",
						ordinal: 1,
						questionTemplate: "{{Back}}",
						answerTemplate: "{{FrontSide}}<hr>{{Front}}",
					},
				]}
				noteTypeId="note-type-1"
				css=".card { color: red; }"
				fieldNames={["Front", "Back"]}
				previewFields={{ Front: "Hola", Back: "Adios" }}
				onSaveCss={
					{
						mutateAsync: vi.fn(),
						isPending: false,
					} as never
				}
			/>,
		);

		await screen.getByRole("button", { name: "Delete" }).click();

		expect(tabsMocks.deleteTemplate.mutateAsync).toHaveBeenCalledWith({
			templateId: "template-1",
			noteTypeId: "note-type-1",
		});
	});

	it("renders substituted card previews from the active template", async () => {
		const { container, ...screen } = await renderWithProviders(
			<CardsTab
				templates={[
					{
						id: "template-1",
						noteTypeId: "note-type-1",
						name: "Card 1",
						ordinal: 0,
						questionTemplate: "<div>Q: {{Front}}</div>",
						answerTemplate: "{{FrontSide}}<hr id='answer'>A: {{Back}}",
					},
				]}
				noteTypeId="note-type-1"
				css=".card { color: red; }"
				fieldNames={["Front", "Back"]}
				previewFields={{ Front: "Hola", Back: "Adios" }}
				onSaveCss={
					{
						mutateAsync: vi.fn(),
						isPending: false,
					} as never
				}
			/>,
		);

		await screen.getByRole("tab", { name: "Preview" }).click();

		await expect.element(screen.getByText("Question Preview")).toBeVisible();
		await expect.element(screen.getByText("Answer Preview")).toBeVisible();
		expect(container.textContent).toContain("Q: Hola");
		expect(container.textContent).toContain("A: Adios");
	});
});
