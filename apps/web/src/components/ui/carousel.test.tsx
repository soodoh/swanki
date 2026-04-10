import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "./carousel";

const { emblaApi, emblaRef, setApi } = vi.hoisted(() => {
	return {
		emblaApi: {
			canScrollPrev: vi.fn(() => true),
			canScrollNext: vi.fn(() => true),
			scrollPrev: vi.fn(),
			scrollNext: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
		},
		emblaRef: vi.fn(),
		setApi: vi.fn(),
	};
});

vi.mock("embla-carousel-react", () => ({
	default: vi.fn(() => [emblaRef, emblaApi]),
}));

describe("Carousel", () => {
	it("exposes the carousel region and wires previous and next actions", async () => {
		const screen = await render(
			<Carousel setApi={setApi}>
				<CarouselContent>
					<CarouselItem>One</CarouselItem>
					<CarouselItem>Two</CarouselItem>
				</CarouselContent>
				<CarouselPrevious />
				<CarouselNext />
			</Carousel>,
		);

		const carousel = screen.container.querySelector('[data-slot="carousel"]');
		const content = screen.container.querySelector(
			'[data-slot="carousel-content"] > div',
		);

		expect(carousel).toBeTruthy();
		expect(content).toBeTruthy();
		await expect.element(screen.getByText("One")).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Previous slide" })).toBeVisible();
		await expect.element(screen.getByRole("button", { name: "Next slide" })).toBeVisible();

		await screen.getByRole("button", { name: "Next slide" }).click();
		await screen.getByRole("button", { name: "Previous slide" }).click();

		expect(setApi).toHaveBeenCalledWith(emblaApi);
		expect(emblaApi.scrollNext).toHaveBeenCalled();
		expect(emblaApi.scrollPrev).toHaveBeenCalled();
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
