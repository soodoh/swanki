import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./table";

describe("Table", () => {
	it("renders the table container and forwards classes", async () => {
		const screen = await render(
			<Table className="text-xs">
				<TableCaption>Deck summary</TableCaption>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Cards</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<TableRow>
						<TableCell>Spanish</TableCell>
						<TableCell>12</TableCell>
					</TableRow>
				</TableBody>
			</Table>,
		);

		const table = screen.getByRole("table");
		const element = screen.container.querySelector('[data-slot="table"]') as HTMLTableElement;
		await expect.element(table).toHaveAttribute("data-slot", "table");
		await expect.element(screen.getByText("Deck summary")).toBeVisible();
		expect(element.className).toContain("text-xs");
		expect(screen.container.querySelector('[data-slot="table-container"]')).toBeTruthy();
	});
});
