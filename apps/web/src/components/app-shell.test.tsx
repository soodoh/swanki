import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { AppShell } from "./app-shell";

vi.mock("@/components/sidebar", () => ({
	AppSidebar: () => <nav aria-label="Sidebar">Sidebar</nav>,
}));

describe("AppShell", () => {
	beforeEach(() => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 200 }),
		);
	});

	it("cycles the theme button through light, dark, and system modes", async () => {
		const screen = await renderWithProviders(
			<AppShell
				user={{ name: "Test User", email: "test@example.com" }}
			>
				<div>Dashboard body</div>
			</AppShell>,
			{ initialTheme: "light" },
		);

		await expect.element(screen.getByRole("navigation")).toBeVisible();
		await expect.element(screen.getByText("Dashboard body")).toBeVisible();
		expect(document.documentElement.classList.contains("light")).toBe(true);

		await screen.getByRole("button", { name: "Theme: Light" }).click();
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		await screen.getByRole("button", { name: "Theme: Dark" }).click();
		expect(document.documentElement.classList.contains("dark")).toBe(false);
		expect(document.documentElement.classList.contains("light")).toBe(false);

		await screen.getByRole("button", { name: "Theme: System" }).click();
		expect(document.documentElement.classList.contains("light")).toBe(true);
	});
});
