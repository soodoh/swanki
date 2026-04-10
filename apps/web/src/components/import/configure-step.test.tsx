import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDecks } from "@/lib/hooks/use-decks";
import { render } from "vitest-browser-react";
import { ConfigureStep, type ImportConfig } from "./configure-step";

vi.mock("@/lib/hooks/use-decks", () => ({
	useDecks: vi.fn(),
}));

const mockedUseDecks = vi.mocked(useDecks);

function ConfigureHarness({
	format,
	file,
	csvPreview,
	csvHeaders,
	initialConfig = {},
}: {
	format: string;
	file: File;
	csvPreview?: string[][];
	csvHeaders?: string[];
	initialConfig?: ImportConfig;
}): ReactElement {
	const [config, setConfig] = useState<ImportConfig>(initialConfig);

	return (
		<ConfigureStep
			format={format}
			file={file}
			config={config}
			onConfigChange={setConfig}
			csvPreview={csvPreview}
			csvHeaders={csvHeaders}
		/>
	);
}

describe("ConfigureStep", () => {
	it("updates CSV import options through the real controls", async () => {
		mockedUseDecks.mockReturnValue({
			data: [
				{
					id: "deck-root",
					name: "Spanish Basics",
					children: [],
				},
			],
		});

		const { container, ...screen } = await render(
			<ConfigureHarness
				format="csv"
				file={new File(["Front,Back"], "spanish.csv", {
					type: "text/csv",
				})}
				csvPreview={[["Hola", "Hello"]]}
				csvHeaders={["Front", "Back"]}
			/>,
		);

		await screen.getByRole("combobox", { name: "Delimiter" }).click();
		await screen.getByRole("option", { name: "Tab" }).click();
		expect(
			container.querySelector('[aria-label="Delimiter"]')?.textContent ?? "",
		).toContain("\t");

		await screen.getByRole("combobox", { name: "Map Front" }).click();
		await screen.getByRole("option", { name: "Skip" }).click();
		expect(
			container.querySelector('[aria-label="Map Front"]')?.textContent ?? "",
		).toContain("__skip__");

		await screen.getByRole("combobox", { name: "Existing deck" }).click();
		await screen.getByRole("option", { name: "Spanish Basics" }).click();
		expect(
			container.querySelector('[aria-label="Existing deck"]')?.textContent ?? "",
		).toContain("Spanish Basics");

		const deckInput = screen.getByPlaceholder("Deck name");
		await deckInput.fill("Vocabulary");
		await expect.element(deckInput).toHaveValue("Vocabulary");
	});

	it("switches APKG import mode with the visible controls", async () => {
		const screen = await render(
			<ConfigureHarness
				format="apkg"
				file={new File(["deck"], "spanish.apkg", {
					type: "application/octet-stream",
				})}
			/>,
		);

		await expect.element(screen.getByText("Deck name:")).toBeVisible();
		await expect.element(screen.getByText("spanish")).toBeVisible();
		await expect.element(screen.getByText("Anki Package")).toBeVisible();

		await screen.getByText("Create new").click();
		await expect.element(screen.getByRole("checkbox", { name: "Create new" })).toBeChecked();
	});
});
