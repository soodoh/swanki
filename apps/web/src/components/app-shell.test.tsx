import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { AppShell } from "./app-shell";

const { setTheme } = vi.hoisted(() => ({
	setTheme: vi.fn(),
}));

vi.mock("@/components/sidebar", () => ({
	AppSidebar: ({
		user,
	}: {
		user: { name: string; email: string; image?: string };
	}) => (
		<aside>
			<div>{user.name}</div>
			<div>{user.email}</div>
		</aside>
	),
}));

vi.mock("@/components/ui/separator", () => ({
	Separator: () => <hr />,
}));

vi.mock("@/components/ui/sidebar", () => ({
	SidebarProvider: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SidebarTrigger: (props: { className?: string }) => (
		<button type="button" {...props}>
			Toggle Sidebar
		</button>
	),
}));

vi.mock("@/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({
		children,
		render,
	}: {
		children?: React.ReactNode;
		render?: React.ReactNode;
	}) => <>{render ?? children}</>,
}));

vi.mock("@/lib/theme", () => ({
	useTheme: () => ({
		theme: "light",
		setTheme,
	}),
}));

describe("AppShell", () => {
	beforeEach(() => {
		setTheme.mockClear();
	});

	it("renders the shell chrome, sidebar user, and main content", async () => {
		const screen = await render(
			<AppShell
				user={{ name: "Ada Lovelace", email: "ada@example.com" }}
			>
				<div>Dashboard</div>
			</AppShell>,
		);

		await expect.element(screen.getByRole("heading", { name: "Swanki" })).toBeVisible();
		await expect.element(screen.getByText("Ada Lovelace")).toBeVisible();
		await expect.element(screen.getByText("ada@example.com")).toBeVisible();
		await expect.element(screen.getByText("Dashboard")).toBeVisible();
	});

	it("cycles to the next theme when the theme button is clicked", async () => {
		const screen = await render(
			<AppShell
				user={{ name: "Ada Lovelace", email: "ada@example.com" }}
			>
				<div>Dashboard</div>
			</AppShell>,
		);

		await screen.getByRole("button", { name: "Theme: Light" }).click();
		expect(setTheme).toHaveBeenCalledWith("dark");
	});
});
