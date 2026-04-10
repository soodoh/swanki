import { useState, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { UploadStep } from "./upload-step";

function Harness(): ReactElement {
	const [file, setFile] = useState<File | undefined>(undefined);
	const [format, setFormat] = useState<string | undefined>(undefined);

	return (
		<div className="space-y-2">
			<UploadStep
				file={file}
				onFileSelect={setFile}
				detectedFormat={format}
				onFormatDetected={setFormat}
			/>
			<output data-testid="format-state">{format ?? "(none)"}</output>
		</div>
	);
}

describe("UploadStep", () => {
	it("accepts a supported file selection and clears it", async () => {
		const screen = await renderWithProviders(<Harness />);
		const input = screen.getByLabelText("Import file").element() as HTMLInputElement;
		const file = new File(["Front,Back"], "notes.csv", { type: "text/csv" });

		Object.defineProperty(input, "files", {
			configurable: true,
			value: [file],
		});

		input.dispatchEvent(new Event("change", { bubbles: true }));

		await expect.element(screen.getByText("notes.csv")).toBeVisible();
		await expect.element(screen.getByTestId("format-state")).toHaveTextContent(
			"csv",
		);

		await screen.getByRole("button", { name: "Clear selected file" }).click();

		await expect.element(screen.getByTestId("format-state")).toHaveTextContent(
			"(none)",
		);
		expect(document.body.textContent ?? "").not.toContain("notes.csv");
	});
});
