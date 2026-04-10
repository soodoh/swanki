import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
	it("renders the placeholder wrapper and forwards native props", async () => {
		const screen = await render(
			<Skeleton
				aria-label="Loading deck"
				className="h-4 w-24"
				style={{ width: "96px", height: "16px" }}
			/>,
		);

		const skeleton = screen.container.querySelector('[data-slot="skeleton"]');
		expect(skeleton).toBeTruthy();
		await expect.element(screen.getByLabelText("Loading deck")).toHaveAttribute(
			"data-slot",
			"skeleton",
		);
	});
});
