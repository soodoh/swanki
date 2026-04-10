import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "./carousel";

describe("Carousel", () => {
	it("wires the real Embla carousel API and navigation controls", async () => {
		const setApi = vi.fn();
		const screen = await render(
			<Carousel setApi={setApi} style={{ width: "200px" }}>
				<CarouselContent style={{ display: "flex", marginLeft: "0px" }}>
					<CarouselItem style={{ flex: "0 0 200px", paddingLeft: "0px" }}>
						One
					</CarouselItem>
					<CarouselItem style={{ flex: "0 0 200px", paddingLeft: "0px" }}>
						Two
					</CarouselItem>
				</CarouselContent>
				<CarouselPrevious />
				<CarouselNext />
			</Carousel>,
		);

		await expect.element(screen.getByText("One")).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Previous slide" })).toHaveAttribute(
			"disabled",
			"",
		);
		await vi.waitFor(() => {
			expect(setApi).toHaveBeenCalledTimes(1);
		});

		const previous = screen.getByRole("button", { name: "Previous slide" });
		const next = screen.getByRole("button", { name: "Next slide" });
		await expect.element(next).not.toHaveAttribute("disabled", "");
		await next.click();
		await expect.element(previous).not.toHaveAttribute("disabled", "");
		await previous.click();
		await expect.element(previous).toHaveAttribute("disabled", "");
	});

	it("switches layout classes for vertical orientation", async () => {
		const screen = await render(
			<Carousel orientation="vertical">
				<CarouselContent>
					<CarouselItem>One</CarouselItem>
				</CarouselContent>
				<CarouselPrevious />
				<CarouselNext />
			</Carousel>,
		);

		const content = screen.container.querySelector(
			'[data-slot="carousel-content"] > div',
		) as HTMLElement;
		expect(content.className).toContain("-mt-4");
		expect(content.className).toContain("flex-col");
	});
});
