import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { ProgressStep } from "./progress-step";

vi.mock("@/components/ui/progress", () => ({
	Progress: ({
		value,
		children,
	}: {
		value: number;
		children?: ReactNode;
	}) => (
		<div data-testid="progress" data-value={value}>
			{children}
		</div>
	),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		className,
	}: {
		children: ReactNode;
		to: string;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

describe("ProgressStep", () => {
	it("renders the active processing state with phase detail and percentage", async () => {
		const screen = await renderWithProviders(
			<ProgressStep
				importProgress={{
					status: "processing",
					progress: 45,
					phase: "Importing notes",
					detail: "Reading package data",
				}}
				onRetry={vi.fn()}
			/>,
		);

		await expect.element(screen.getByText("Importing...")).toBeVisible();
		await expect.element(screen.getByText("Importing notes")).toBeVisible();
		await expect.element(screen.getByText("Reading package data")).toBeVisible();
		await expect.element(screen.getByText("45%")).toBeVisible();
	});

	it("renders the complete state summary and retries another import", async () => {
		const onRetry = vi.fn();
		const screen = await renderWithProviders(
			<ProgressStep
				importProgress={{
					status: "complete",
					progress: 100,
					result: {
						cardCount: 10,
						noteCount: 5,
						duplicatesSkipped: 2,
						notesUpdated: 1,
						errors: ["Skipped malformed row"],
						mediaCount: 3,
					},
				}}
				onRetry={onRetry}
			/>,
		);

		await expect.element(screen.getByText("Import Successful")).toBeVisible();
		await expect.element(screen.getByText("Cards imported")).toBeVisible();
		await expect.element(screen.getByText("Notes updated")).toBeVisible();
		await expect.element(screen.getByText("Media files")).toBeVisible();
		await expect.element(screen.getByText("Skipped malformed row")).toBeVisible();

		await screen.getByRole("button", { name: "Import Another" }).click();

		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
