import { describe, expect, it } from "vitest";
import type { ApkgPreviewData } from "@/lib/import/apkg-parser-client";
import { render } from "vitest-browser-react";
import { PreviewStep } from "./preview-step";

describe("PreviewStep", () => {
	it("renders the CSV preview summary, sample table, and duplicate warning", async () => {
		const screen = await render(
			<PreviewStep
				file={new File(["Front,Back"], "spanish.csv", {
					type: "text/csv",
				})}
				format="csv"
				sampleCards={[
					{ fields: { Front: "Hola", Back: "Hello" } },
					{ fields: { Front: "Adios", Back: "Goodbye" } },
				]}
				totalCards={2}
				duplicateCount={1}
			/>,
		);

		await expect.element(screen.getByText("Duplicates")).toBeVisible();
		await expect.element(screen.getByText("Front")).toBeVisible();
		await expect.element(screen.getByText("Back")).toBeVisible();
		await expect.element(screen.getByText("Hola")).toBeVisible();
		await expect.element(screen.getByText("Hello")).toBeVisible();
	});

	it("lets the user move through APKG preview slides", async () => {
		const apkgPreview: ApkgPreviewData = {
			decks: [{ name: "Spanish" }],
			noteTypes: [
				{
					name: "Basic",
					fields: [
						{ name: "Front", ordinal: 0 },
						{ name: "Back", ordinal: 1 },
					],
					templates: [
						{
							name: "Card 1",
							questionFormat: "{{Front}}",
							answerFormat: "{{FrontSide}}<hr>{{Back}}",
							ordinal: 0,
						},
					],
					css: "",
				},
			],
			sampleNotes: [
				{
					noteTypeName: "Basic",
					fields: { Front: "Hola", Back: "Hello" },
				},
				{
					noteTypeName: "Basic",
					fields: { Front: "Adios", Back: "Goodbye" },
				},
			],
			totalCards: 2,
			totalNotes: 2,
			totalMedia: 1,
			mergeStats: {
				newNotes: 1,
				updatedNotes: 1,
				unchangedNotes: 0,
			},
		};

		const screen = await render(
			<PreviewStep
				file={new File(["deck"], "spanish.apkg", {
					type: "application/octet-stream",
				})}
				format="apkg"
				sampleCards={[]}
				totalCards={2}
				duplicateCount={0}
				apkgPreview={apkgPreview}
			/>,
		);

		await expect
			.element(screen.getByText("Card 1 of 2 samples (2 total notes)"))
			.toBeVisible();
		await expect.element(screen.getByText("Hola")).toBeVisible();
		await expect.element(screen.getByText("Media files (images, audio) will display after import.")).toBeVisible();
		await expect.element(screen.getByText("1 note has changed and will be updated.")).toBeVisible();
	});
});
