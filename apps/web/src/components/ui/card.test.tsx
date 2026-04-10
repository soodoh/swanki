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
	it("renders the card structure and forwards size metadata", async () => {
		const screen = await render(
			<Card size="sm">
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

		const card = screen.container.querySelector('[data-slot="card"]');
		const header = screen.container.querySelector('[data-slot="card-header"]');
		const title = screen.container.querySelector('[data-slot="card-title"]');
		const description = screen.container.querySelector('[data-slot="card-description"]');
		const action = screen.container.querySelector('[data-slot="card-action"]');
		const content = screen.container.querySelector('[data-slot="card-content"]');
		const footer = screen.container.querySelector('[data-slot="card-footer"]');

		expect(card).toBeTruthy();
		expect(header).toBeTruthy();
		expect(title).toBeTruthy();
		expect(description).toBeTruthy();
		expect(action).toBeTruthy();
		expect(content).toBeTruthy();
		expect(footer).toBeTruthy();

		await expect.element(card as Element).toHaveAttribute("data-size", "sm");
		await expect.element(screen.getByRole("button", { name: "Edit" })).toBeVisible();
		await expect.element(screen.getByText("Daily review")).toBeVisible();
		await expect.element(screen.getByText("3 cards due")).toBeVisible();
		await expect.element(screen.getByText("Review the current deck.")).toBeVisible();
		await expect.element(screen.getByText("Footer actions")).toBeVisible();
	});
});
