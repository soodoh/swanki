import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CssCodeEditor } from "./css-code-editor";

vi.mock("@uiw/react-codemirror", () => {
	function MockCodeMirror({
		value,
		onChange,
	}: {
		value: string;
		onChange: (value: string) => void;
	}): React.ReactElement {
		return (
			<textarea
				aria-label="CSS code editor"
				value={value}
				onInput={(event) => onChange(event.currentTarget.value)}
				readOnly={false}
			/>
		);
	}

	return {
		default: MockCodeMirror,
		EditorView: { lineWrapping: {} },
	};
});

describe("CssCodeEditor", () => {
	it("renders the current CSS value", async () => {
		const screen = await renderWithProviders(
			<CssCodeEditor value=".card { color: red; }" onChange={() => {}} />,
		);

		await expect
			.element(screen.getByLabelText("CSS code editor"))
			.toHaveValue(".card { color: red; }");
	});

	it("forwards edited CSS to onChange", async () => {
		const onChange = vi.fn();

		const screen = await renderWithProviders(
			<CssCodeEditor value="" onChange={onChange} />,
		);

		await screen.getByLabelText("CSS code editor").fill(".card { color: blue; }");

		expect(onChange).toHaveBeenLastCalledWith(".card { color: blue; }");
	});
});
