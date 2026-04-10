import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import type { ApkgPreviewData } from "@/lib/import/apkg-parser-client";
import { PreviewStep } from "./preview-step";

vi.mock("@/components/ui/carousel", () => ({
	Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CarouselContent: ({
		children,
	}: {
		children: React.ReactNode;
	}) => <div>{children}</div>,
	CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CarouselPrevious: () => <button type="button">Previous</button>,
	CarouselNext: () => <button type="button">Next</button>,
	useCarousel: () => ({ api: undefined }),
}));

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
					questionFormat: "<div>{{Front}}</div>",
					answerFormat: "{{FrontSide}}<div>{{Back}}</div>",
					ordinal: 0,
				},
			],
			css: "",
		},
	],
	sampleNotes: [
		{
			noteTypeName: "Basic",
			fields: {
				Front: "Hola",
				Back: "Hello",
			},
		},
	],
	totalCards: 3,
	totalNotes: 1,
	totalMedia: 2,
	mergeStats: {
		newNotes: 1,
		updatedNotes: 1,
		unchangedNotes: 1,
	},
};

describe("PreviewStep", () => {
	it("renders CSV preview rows and duplicate warnings", async () => {
		const screen = await renderWithProviders(
			<PreviewStep
				file={new File([], "notes.csv")}
				format="csv"
				sampleCards={[
					{ fields: { Front: "Hola", Back: "Hello" } },
					{ fields: { Front: "Adios", Back: "Goodbye" } },
				]}
				totalCards={2}
				duplicateCount={1}
			/>,
		);

		await expect.element(screen.getByText("Sample (2 of 2 cards)")).toBeVisible();
		await expect.element(screen.getByText("Hola")).toBeVisible();
		await expect.element(screen.getByText("Goodbye")).toBeVisible();
		await expect.element(screen.getByText("1 duplicate detected")).toBeVisible();
		await expect.element(screen.getByText("notes.csv")).toBeVisible();
	});

	it("renders APKG summary stats and the first sample card preview", async () => {
		const screen = await renderWithProviders(
			<PreviewStep
				file={new File([], "spanish.apkg")}
				format="apkg"
				sampleCards={[]}
				totalCards={0}
				duplicateCount={0}
				apkgPreview={apkgPreview}
			/>,
		);

		await expect.element(screen.getByText("Card 1 of 1 samples (1 total notes)")).toBeVisible();
		await expect.element(screen.getByText("Hola")).toBeVisible();
		await expect
			.element(screen.getByText("Media files (images, audio) will display after import."))
			.toBeVisible();
		await expect.element(
			screen.getByText("1 note has changed and will be updated."),
		).toBeVisible();
	});
});
