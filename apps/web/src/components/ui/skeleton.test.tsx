import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
	it("renders the placeholder wrapper and forwards native props", async () => {
		const screen = await render(
			<Skeleton
				aria-label="Loading deck"
				className="test-skeleton"
				style={{ width: "96px", height: "16px" }}
			/>,
		);

		const skeleton = screen.getByLabelText("Loading deck");
		await expect.element(skeleton).toHaveClass(/test-skeleton/);
		await expect.element(skeleton).toHaveAttribute(
			"style",
			"width: 96px; height: 16px;",
		);
	});
});
