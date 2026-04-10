import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { FieldAttachments } from "./field-attachments";

describe("FieldAttachments", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders existing media attachments and keeps the upload affordance visible", async () => {
		const { container, ...screen } = await render(
			<FieldAttachments
				fieldValue="Front [image:cat.png] text"
				onFieldChange={() => {}}
			/>,
		);

		expect(container.querySelector("img")?.getAttribute("src")).toBe(
			"/api/media/cat.png",
		);
		await expect
			.element(screen.getByRole("button", { name: "Attach media" }))
			.toBeVisible();
	});

	it("shows a dedicated preview for media-only fields and clears the value on delete", async () => {
		const onFieldChange = vi.fn();

		const { container, ...screen } = await render(
			<FieldAttachments
				fieldValue="[image:cover.png]"
				onFieldChange={onFieldChange}
				mediaExclusive={true}
			/>,
		);

		expect(container.querySelector("img")?.getAttribute("src")).toBe(
			"/api/media/cover.png",
		);
		await expect.element(screen.getByText("cover.png")).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Replace" })).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Delete" })).toBeVisible();

		await screen.getByRole("button", { name: "Delete" }).click();

		expect(onFieldChange).toHaveBeenCalledWith("");
	});
});
