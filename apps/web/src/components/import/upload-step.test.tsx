import { useState, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { UploadStep } from "./upload-step";

function UploadHarness(): ReactElement {
	const [file, setFile] = useState<File | undefined>(undefined);
	const [format, setFormat] = useState<string | undefined>(undefined);

	return (
		<UploadStep
			file={file}
			onFileSelect={setFile}
			detectedFormat={format}
			onFormatDetected={setFormat}
		/>
	);
}

describe("UploadStep", () => {
	it("accepts supported files and shows the selected file summary", async () => {
		const { container, getByText } = await render(<UploadHarness />);
		const input = container.querySelector('input[type="file"]') as
			| HTMLInputElement
			| null;
		if (!input) {
			throw new Error("File input not found");
		}

		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(
			new File(["front,back"], "spanish.apkg", {
				type: "application/octet-stream",
			}),
		);
		Object.defineProperty(input, "files", {
			configurable: true,
			value: dataTransfer.files,
		});
		input.dispatchEvent(new Event("change", { bubbles: true }));

		await expect.element(getByText("spanish.apkg")).toBeVisible();
		await expect.element(getByText("Anki Package")).toBeVisible();
		await expect.element(getByText("0.0 KB")).toBeVisible();
	});

	it("clears the selected file when the clear button is clicked", async () => {
		const { container, getByText, getByRole } = await render(<UploadHarness />);
		const input = container.querySelector('input[type="file"]') as
			| HTMLInputElement
			| null;
		if (!input) {
			throw new Error("File input not found");
		}

		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(
			new File(["front,back"], "spanish.csv", { type: "text/csv" }),
		);
		Object.defineProperty(input, "files", {
			configurable: true,
			value: dataTransfer.files,
		});
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await getByRole("button", { name: "Clear selected file" }).click();

		await expect.element(getByText("Drag and drop your file here")).toBeVisible();
	});
});
