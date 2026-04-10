import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { ApkgCardPreview } from "./apkg-card-preview";

const noteType = {
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
};

describe("ApkgCardPreview", () => {
	it("renders the front first and toggles the back template on demand", async () => {
		const screen = await renderWithProviders(
			<ApkgCardPreview
				noteTypeName="Basic"
				fields={{ Front: "Hola", Back: "Answer only" }}
				noteType={noteType}
				index={0}
			/>,
		);

		await expect.element(screen.getByText("Hola")).toBeVisible();
		expect(document.body.textContent ?? "").not.toContain("Answer only");

		await screen.getByRole("button", { name: "Show Back" }).click();

		await expect.element(screen.getByText("Answer only")).toBeVisible();
	});

	it("shows a fallback when the note type has no template", async () => {
		const screen = await renderWithProviders(
			<ApkgCardPreview
				noteTypeName="Basic"
				fields={{ Front: "Hola", Back: "Hello" }}
				noteType={{ ...noteType, templates: [] }}
				index={0}
			/>,
		);

		await expect
			.element(screen.getByText("No template available for this note type."))
			.toBeVisible();
	});
});
