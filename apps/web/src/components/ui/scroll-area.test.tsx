import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ScrollArea, ScrollBar } from "./scroll-area";

describe("ScrollArea", () => {
	it("renders its viewport and content inside the scroll container", async () => {
		const screen = await render(
			<>
				<style>{`[data-slot="scroll-area-viewport"] { width: 100%; height: 100%; }`}</style>
				<ScrollArea style={{ height: "80px", width: "128px" }}>
					<div style={{ height: "160px" }}>Row 1</div>
					<div>Row 2</div>
				</ScrollArea>
			</>,
		);

		await expect.element(screen.getByText("Row 1")).toBeVisible();
		await expect.element(screen.getByText("Row 2")).toBeVisible();
		await expect
			.element(screen.container.querySelector('[data-slot="scroll-area"]') as Element)
			.toHaveAttribute("data-slot", "scroll-area");
		await expect
			.element(
				screen.container.querySelector(
					'[data-slot="scroll-area-viewport"]',
				) as Element,
			)
			.toHaveAttribute("data-slot", "scroll-area-viewport");
		await expect
			.element(
				screen.container.querySelector(
					'[data-slot="scroll-area-scrollbar"]',
				) as Element,
			)
			.toHaveAttribute("data-slot", "scroll-area-scrollbar");
	});

	it("renders a horizontal scrollbar when requested", async () => {
		const screen = await render(
			<ScrollAreaPrimitive.Root style={{ height: "80px", width: "128px" }}>
				<ScrollAreaPrimitive.Viewport>
					<div style={{ width: "320px" }}>Wide row</div>
				</ScrollAreaPrimitive.Viewport>
				<ScrollBar orientation="horizontal" />
				<ScrollAreaPrimitive.Corner />
			</ScrollAreaPrimitive.Root>,
		);

		await expect.element(screen.getByText("Wide row")).toBeVisible();
		await expect
			.element(screen.container.querySelector('[data-slot="scroll-area-scrollbar"]') as Element)
			.toHaveAttribute("data-orientation", "horizontal");
	});
});
