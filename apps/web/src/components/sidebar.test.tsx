import { PlatformProvider } from "@swanki/core/platform";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { AppSidebar } from "./sidebar";

const { authSignIn, authSignOut } = vi.hoisted(() => ({
	authSignIn: vi.fn(),
	authSignOut: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to?: string;
		params?: Record<string, string>;
	}) => {
		let href = to ?? "#";
		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
	useRouterState: () => ({
		location: { pathname: "/browse" },
	}),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: authSignOut,
	},
}));

vi.mock("@/components/ui/sidebar", () => ({
	Sidebar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
	SidebarContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SidebarFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SidebarGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
	SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SidebarGroupLabel: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
	SidebarHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
	SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
	SidebarMenuButton: ({
		children,
		render,
		...props
	}: {
		children: ReactNode;
		render?: ReactNode;
	}) => {
		if (isValidElement(render)) {
			return cloneElement(render, props, children);
		}
		return <button {...props}>{children}</button>;
	},
	SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
	SidebarRail: () => <div />,
	SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuItem: ({
		children,
		onClick,
		render,
		...props
	}: {
		children: ReactNode;
		onClick?: () => void;
		render?: ReactNode;
	}) => {
		if (isValidElement(render)) {
			return cloneElement(render, { ...props, onClick }, children);
		}
		return (
			<button type="button" onClick={onClick} {...props}>
				{children}
			</button>
		);
	},
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuTrigger: ({
		children,
		render,
		...props
	}: {
		children?: ReactNode;
		render?: ReactNode;
	}) => (isValidElement(render) ? cloneElement(render, props, children) : <>{children}</>),
}));

describe("AppSidebar", () => {
	beforeEach(() => {
		authSignIn.mockReset();
		authSignOut.mockReset();
	});

	afterEach(() => {
		delete (globalThis as typeof globalThis & { electronAPI?: unknown }).electronAPI;
	});

	it("renders the main navigation links for the current route", async () => {
		const screen = await render(
			<AppSidebar user={{ name: "Ada Lovelace", email: "ada@example.com" }} />,
		);

		await expect.element(screen.getByRole("link", { name: "Decks" })).toBeVisible();
		await expect.element(screen.getByRole("link", { name: "Browse" })).toBeVisible();
		await expect.element(screen.getByRole("link", { name: "Import" })).toBeVisible();
		await expect.element(screen.getByRole("link", { name: "Statistics" })).toBeVisible();
		await expect.element(screen.getByRole("link", { name: "Note Types" })).toBeVisible();
		await expect.element(screen.getByRole("link", { name: "Settings" })).toBeVisible();
	});

	it("shows the desktop sign-in action when the electron app is signed out", async () => {
		(globalThis as typeof globalThis & {
			electronAPI: {
				authStatus: () => Promise<{
					signedIn: boolean;
					user?: { name: string; email: string; image?: string };
				}>;
				authSignIn: typeof authSignIn;
				authCompleteSignIn: () => Promise<{ ok: boolean }>;
				authSignOut: typeof authSignOut;
			};
		}).electronAPI = {
			authStatus: vi.fn().mockResolvedValue({ signedIn: false }),
			authSignIn,
			authCompleteSignIn: vi.fn(),
			authSignOut,
		};

		const screen = await render(
			<PlatformProvider value="desktop">
				<AppSidebar user={{ name: "Ada Lovelace", email: "ada@example.com" }} />
			</PlatformProvider>,
		);

		await screen.getByRole("button", { name: /Ada Lovelace/ }).click();
		await screen.getByRole("button", { name: "Sign in" }).click();

		expect(authSignIn).toHaveBeenCalled();
	});
});
