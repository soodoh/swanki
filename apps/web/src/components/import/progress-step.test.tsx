import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ProgressStep } from "./progress-step";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: {
		children: ReactNode;
		to?: string;
	}) => <a href={to} {...props}>{children}</a>,
}));

describe("ProgressStep", () => {
	it("shows upload progress details while an import is running", async () => {
		const screen = await render(
			<ProgressStep
				importProgress={{
					status: "uploading",
					progress: 42,
					detail: "Sending file to the server",
				}}
				onRetry={() => {}}
			/>,
		);

		await expect.element(screen.getByText("Importing...")).toBeVisible();
		await expect.element(screen.getByText("Uploading...")).toBeVisible();
		await expect.element(screen.getByText("Sending file to the server")).toBeVisible();
		await expect.element(screen.getByText("42%")).toBeVisible();
	});

	it("renders the success summary and retry action", async () => {
		const onRetry = vi.fn();
		const screen = await render(
			<ProgressStep
				importProgress={{
					status: "complete",
					progress: 100,
					result: {
						cardCount: 12,
						noteCount: 8,
						duplicatesSkipped: 2,
						notesUpdated: 1,
						errors: ["One note had an empty field"],
						mediaCount: 3,
					},
				}}
				onRetry={onRetry}
			/>,
		);

		await expect.element(screen.getByText("Import Complete")).toBeVisible();
		await expect.element(screen.getByText("Cards imported")).toBeVisible();
		await expect.element(screen.getByText("Notes created")).toBeVisible();
		await expect.element(screen.getByText("Notes updated")).toBeVisible();
		await expect.element(screen.getByText("Unchanged")).toBeVisible();
		await expect.element(screen.getByText("Media files")).toBeVisible();
		await expect.element(screen.getByText("1 warning")).toBeVisible();

		await screen.getByRole("button", { name: "Import Another" }).click();
		expect(onRetry).toHaveBeenCalled();
	});
});
