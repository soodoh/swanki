import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ScrollArea } from "./scroll-area";

vi.mock("@base-ui/react/scroll-area", () => ({
	ScrollArea: {
		Root: ({ children, ...props }: { children: ReactNode }) => (
			<div {...props}>{children}</div>
		),
		Viewport: ({ children, ...props }: { children: ReactNode }) => (
			<div {...props}>{children}</div>
		),
		Scrollbar: ({ children, ...props }: { children: ReactNode }) => (
			<div {...props}>{children}</div>
		),
		Thumb: (props: Record<string, unknown>) => <div {...props} />,
		Corner: () => <div />,
	},
}));

describe("ScrollArea", () => {
	it("renders its viewport and content inside the scroll container", async () => {
		const screen = await render(
			<ScrollArea className="h-20 w-32">
				<div>Row 1</div>
				<div>Row 2</div>
			</ScrollArea>,
		);

		await expect.element(screen.getByText("Row 1")).toBeVisible();
		await expect.element(screen.getByText("Row 2")).toBeVisible();
		const root = screen.container.querySelector('[data-slot="scroll-area"]') as HTMLElement;
		const viewport = screen.container.querySelector('[data-slot="scroll-area-viewport"]');
		const scrollbar = screen.container.querySelector('[data-slot="scroll-area-scrollbar"]');

		expect(root).toBeTruthy();
		expect(viewport).toBeTruthy();
		expect(scrollbar).toBeTruthy();
		expect(root.className).toContain("h-20");
		expect(root.className).toContain("w-32");
	});
});
