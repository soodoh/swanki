import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
	it("renders the active panel for the controlled value", async () => {
		const screen = await render(
			<Tabs value="deck">
				<TabsList>
					<TabsTrigger value="deck">Deck</TabsTrigger>
					<TabsTrigger value="cards">Cards</TabsTrigger>
				</TabsList>
				<TabsContent value="deck">Deck content</TabsContent>
				<TabsContent value="cards">Cards content</TabsContent>
			</Tabs>,
		);

		await expect.element(screen.getByText("Deck content")).toBeVisible();
		await expect.element(screen.getByRole("tab", { name: "Deck" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	it("switches tabs through the wrapper contract", async () => {
		function Harness() {
			const [value, setValue] = useState("deck");

			return (
				<Tabs value={value} onValueChange={setValue}>
					<TabsList>
						<TabsTrigger value="deck">Deck</TabsTrigger>
						<TabsTrigger value="cards">Cards</TabsTrigger>
					</TabsList>
					<TabsContent value="deck">Deck content</TabsContent>
					<TabsContent value="cards">Cards content</TabsContent>
				</Tabs>
			);
		}

		const screen = await render(<Harness />);

		await screen.getByRole("tab", { name: "Cards" }).click();
		await expect.element(screen.getByText("Cards content")).toBeVisible();
	});
});
