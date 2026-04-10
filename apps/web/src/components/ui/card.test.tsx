import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "./card";

describe("Card", () => {
	it("renders the card sections and preserves visible content", async () => {
		const screen = await render(
			<Card className="test-card">
				<CardHeader>
					<CardTitle>Daily review</CardTitle>
					<CardDescription>3 cards due</CardDescription>
					<CardAction>
						<button type="button">Edit</button>
					</CardAction>
				</CardHeader>
				<CardContent>Review the current deck.</CardContent>
				<CardFooter>Footer actions</CardFooter>
			</Card>,
		);

		await expect
			.element(screen.container.querySelector(".test-card") as Element)
			.toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Edit" })).toBeVisible();
		await expect.element(screen.getByText("Daily review")).toBeVisible();
		await expect.element(screen.getByText("3 cards due")).toBeVisible();
		await expect.element(screen.getByText("Review the current deck.")).toBeVisible();
		await expect.element(screen.getByText("Footer actions")).toBeVisible();
		expect(
			screen.container.querySelector('[data-slot="card-title"]')?.textContent,
		).toContain("Daily review");
		expect(
			screen.container.querySelector('[data-slot="card-header"]')?.textContent,
		).toContain("Daily review");
		expect(
			screen.container.querySelector('[data-slot="card-description"]')?.textContent,
		).toContain("3 cards due");
		expect(
			screen.container.querySelector('[data-slot="card-action"]')?.textContent,
		).toContain("Edit");
		expect(
			screen.container.querySelector('[data-slot="card-content"]')?.textContent,
		).toContain("Review the current deck.");
		expect(
			screen.container.querySelector('[data-slot="card-footer"]')?.textContent,
		).toContain("Footer actions");
	});
});
