import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ApkgCardPreview } from "./apkg-card-preview";

describe("ApkgCardPreview", () => {
	it("renders the front and reveals the back on demand", async () => {
		const screen = await render(
			<ApkgCardPreview
				index={0}
				noteTypeName="Basic"
				fields={{ Front: "Hola", Back: "Hello" }}
				noteType={{
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
				}}
			/>,
		);

		await expect.element(screen.getByText("#1")).toBeVisible();
		await expect.element(screen.getByText("Basic")).toBeVisible();
		await expect.element(screen.getByText("Card 1")).toBeVisible();
		await expect.element(screen.getByText("Hola")).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Show Back" })).toBeVisible();

		await screen.getByRole("button", { name: "Show Back" }).click();

		await expect.element(screen.getByRole("button", { name: "Hide Back" })).toBeVisible();
		await expect.element(screen.getByText("Hello")).toBeVisible();
	});

	it("shows a fallback when no template is available", async () => {
		const screen = await render(
			<ApkgCardPreview
				index={0}
				noteTypeName="Basic"
				fields={{ Front: "Hola" }}
				noteType={{
					name: "Basic",
					fields: [{ name: "Front", ordinal: 0 }],
					templates: [],
					css: "",
				}}
			/>,
		);

		await expect.element(
			screen.getByText("No template available for this note type."),
		).toBeVisible();
	});
});
