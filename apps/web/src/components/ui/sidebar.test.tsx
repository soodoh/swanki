import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	Sidebar,
	SidebarProvider,
	SidebarTrigger,
} from "./sidebar";
import { useState } from "react";

const { isMobile, setCookie } = vi.hoisted(() => ({
	isMobile: vi.fn(() => false),
	setCookie: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: isMobile,
}));

vi.mock("@/lib/cookies", () => ({
	setCookie,
}));

describe("Sidebar", () => {
	it("updates controlled state from the provider contract", async () => {
		function Harness() {
			const [open, setOpen] = useState(true);

			return (
				<>
					<button type="button" onClick={() => setOpen(false)}>
						Collapse
					</button>
					<SidebarProvider open={open} onOpenChange={setOpen}>
						<Sidebar collapsible="icon">
							<SidebarTrigger />
							<div>Sidebar content</div>
						</Sidebar>
					</SidebarProvider>
				</>
			);
		}

		const screen = await render(<Harness />);

		const sidebar = screen.container.querySelector(
			'[data-slot="sidebar"][data-state]',
		) as HTMLElement;
		expect(sidebar).toBeTruthy();
		expect(sidebar).toHaveAttribute("data-state", "expanded");

		await screen.getByRole("button", { name: "Collapse" }).click();

		expect(sidebar).toHaveAttribute("data-state", "collapsed");
	});
});
