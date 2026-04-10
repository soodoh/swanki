import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Badge } from "./badge";

describe("Badge", () => {
	it("renders as a link and preserves forwarded props", async () => {
		const screen = await render(
			<Badge
				render={<a href="/cards">New</a>}
				variant="secondary"
				className="test-badge"
			/>,
		);

		const badge = screen.getByRole("link", { name: "New" });
		await expect.element(badge).toHaveAttribute("href", "/cards");
		await expect.element(badge).toHaveClass(/test-badge/);
		await expect.element(badge).toHaveAttribute("data-slot", "badge");
		await expect.element(badge).toHaveAttribute("data-variant", "secondary");
	});
});
