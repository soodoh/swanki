import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { TemplateCodeEditor } from "./template-code-editor";

vi.mock("@uiw/react-codemirror", () => {
	type ChangeHandler = (value: string) => void;
	type EditorViewLike = {
		state: { selection: { main: { from: number; to: number } } };
		dispatch: (spec: {
			changes: { from: number; to: number; insert: string };
			selection: { anchor: number };
		}) => void;
		focus: () => void;
	};

	function MockCodeMirror({
		value,
		onChange,
		onCreateEditor,
	}: {
		value: string;
		onChange: ChangeHandler;
		onCreateEditor?: (view: EditorViewLike) => void;
	}): React.ReactElement {
		let currentValue = value;
		let selectionStart = value.length;
		let selectionEnd = value.length;
		let textarea: HTMLTextAreaElement | null = null;

		const view: EditorViewLike = {
			state: {
				selection: {
					main: {
						get from() {
							return textarea?.selectionStart ?? selectionStart;
						},
						get to() {
							return textarea?.selectionEnd ?? selectionEnd;
						},
					},
				},
			},
			dispatch(spec) {
				currentValue =
					currentValue.slice(0, spec.changes.from) +
					spec.changes.insert +
					currentValue.slice(spec.changes.to);
				selectionStart = spec.selection.anchor;
				selectionEnd = spec.selection.anchor;
				onChange(currentValue);
			},
			focus() {},
		};

		onCreateEditor?.(view);

		return (
			<textarea
				aria-label="Template code editor"
				defaultValue={value}
				ref={(node) => {
					textarea = node;
				}}
				onClick={(event) => {
					const target = event.currentTarget;
					selectionStart = target.selectionStart ?? currentValue.length;
					selectionEnd = target.selectionEnd ?? selectionStart;
				}}
				onSelect={(event) => {
					const target = event.currentTarget;
					selectionStart = target.selectionStart ?? currentValue.length;
					selectionEnd = target.selectionEnd ?? selectionStart;
				}}
			/>
		);
	}

	return {
		default: MockCodeMirror,
		EditorView: { lineWrapping: {} },
	};
});

describe("TemplateCodeEditor", () => {
	it("inserts the selected field token from the toolbar at the cursor", async () => {
		const onChange = vi.fn();

		const screen = await renderWithProviders(
			<TemplateCodeEditor
				value="<div></div>"
				onChange={onChange}
				fieldNames={["Front", "Back"]}
			/>,
		);

		const editor = screen.getByLabelText("Template code editor");
		await editor.click();
		editor.element().setSelectionRange(5, 5);

		await screen.getByRole("button", { name: /field/i }).click();
		await screen.getByText("{{Front}}").click();

		expect(onChange).toHaveBeenLastCalledWith("<div>{{Front}}</div>");
	});

	it("inserts FrontSide from the answer-template toolbar", async () => {
		const onChange = vi.fn();

		const screen = await renderWithProviders(
			<TemplateCodeEditor
				value=""
				onChange={onChange}
				fieldNames={["Front", "Back"]}
				isAnswerTemplate
			/>,
		);

		await screen.getByRole("button", { name: /frontside/i }).click();

		expect(onChange).toHaveBeenLastCalledWith("{{FrontSide}}");
	});
});
