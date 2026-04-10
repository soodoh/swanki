import { useState, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { NoteTable } from "./note-table";

function daysFromNow(days: number): string {
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

const notes = [
	{
		noteId: "note-1",
		noteTypeId: "type-1",
		noteTypeName: "Basic",
		fields: {
			Front: "<strong>Alpha</strong> beta",
		},
		tags: "",
		deckName: "Spanish",
		deckId: "deck-1",
		cardCount: 3,
		earliestDue: daysFromNow(0),
		states: [0, 2],
		suspended: false,
		createdAt: "2026-04-09T12:00:00.000Z",
		updatedAt: "2026-04-09T12:00:00.000Z",
	},
	{
		noteId: "note-2",
		noteTypeId: "type-1",
		noteTypeName: "Basic",
		fields: {
			Front: "Gamma",
		},
		tags: "",
		deckName: "French",
		deckId: "deck-2",
		cardCount: 1,
		earliestDue: daysFromNow(1),
		states: [1],
		suspended: true,
		createdAt: "2026-04-09T12:00:00.000Z",
		updatedAt: "2026-04-09T12:00:00.000Z",
	},
];

function Harness(): ReactElement {
	const [selectedNoteId, setSelectedNoteId] = useState<string | undefined>(
		undefined,
	);
	const [sortBy, setSortBy] = useState<"due" | "created" | "updated">("due");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [page, setPage] = useState(1);

	return (
		<div className="grid gap-2">
			<NoteTable
				notes={notes as never}
				total={21}
				page={page}
				limit={10}
				selectedNoteId={selectedNoteId}
				onSelectNote={setSelectedNoteId}
				sortBy={sortBy}
				sortDir={sortDir}
				onSortChange={(nextSortBy, nextSortDir) => {
					setSortBy(nextSortBy);
					setSortDir(nextSortDir);
				}}
				onPageChange={setPage}
				isLoading={false}
			/>
			<output data-testid="sort-state">{`${sortBy}:${sortDir}`}</output>
		</div>
	);
}

describe("NoteTable", () => {
	it("renders previews, selection state, sorting, and pagination controls", async () => {
		const { container, ...screen } = await render(<Harness />);

		await expect.element(screen.getByText("Alpha beta")).toBeVisible();
		await expect.element(screen.getByText("Today")).toBeVisible();
		await expect.element(screen.getByText("Tomorrow")).toBeVisible();
		await expect.element(screen.getByText("Suspended")).toBeVisible();

		const selectedRow = screen.getByText("Alpha beta").element().closest("tr");
		await screen.getByText("Alpha beta").click();
		await expect.element(selectedRow as Element).toHaveAttribute(
			"data-state",
			"selected",
		);

		await screen.getByRole("button", { name: "Due" }).click();
		await expect.element(screen.getByTestId("sort-state")).toHaveTextContent(
			"due:desc",
		);
		await screen.getByRole("button", { name: "Due" }).click();
		await expect.element(screen.getByTestId("sort-state")).toHaveTextContent(
			"due:asc",
		);

		await screen.getByRole("button", { name: "Next page" }).click();
		expect(container.textContent ?? "").toContain("2 / 3");
		await screen.getByRole("button", { name: "Previous page" }).click();
		expect(container.textContent ?? "").toContain("1 / 3");
	});
});
