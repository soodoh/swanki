import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Badge } from "./badge";

describe("Badge", () => {
	it("renders as a link and forwards the slot metadata", async () => {
		const screen = await render(
			<Badge render={<a href="/cards">New</a>} variant="secondary" />,
		);

		const badge = screen.getByRole("link", { name: "New" });
		await expect.element(badge).toHaveAttribute("data-slot", "badge");
		await expect.element(badge).toHaveAttribute("data-variant", "secondary");
		await expect.element(badge).toHaveAttribute("href", "/cards");
	});
});
