import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { renderWithProviders } from "@/__tests__/browser/render";
import { AppSidebar } from "./sidebar";

const sidebarMocks = vi.hoisted(() => ({
	signOut: vi.fn(),
	useRouterState: vi.fn(),
	authStatus: vi.fn(),
	authSignIn: vi.fn(),
	authCompleteSignIn: vi.fn(),
	authSignOut: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: sidebarMocks.signOut,
	},
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		className,
		...props
	}: {
		children?: ReactNode;
		to: string;
		className?: string;
	}): ReactElement => (
		<a href={to} className={className} {...props}>
			{children}
		</a>
	),
	useRouterState: sidebarMocks.useRouterState,
}));

vi.mock("@/components/ui/sidebar", async () => {
	const React = await import("react");

	return {
		Sidebar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
		SidebarContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		SidebarFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		SidebarGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		SidebarGroupContent: ({ children }: { children: ReactNode }) => (
			<div>{children}</div>
		),
		SidebarGroupLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		SidebarHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		SidebarMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		SidebarMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		SidebarRail: () => <div />,
		SidebarMenuButton: ({
			children,
			render,
			isActive,
			...props
		}: {
			children?: ReactNode;
			render?: ReactElement;
			isActive?: boolean;
			"aria-current"?: string;
		}): ReactElement => {
			if (render) {
				return React.cloneElement(render, {
					...render.props,
					...props,
					children,
					"data-active": isActive ? "true" : undefined,
				});
			}
			return (
				<button type="button" data-active={isActive ? "true" : undefined} {...props}>
					{children}
				</button>
			);
		},
	};
});

vi.mock("@/components/ui/dropdown-menu", async () => {
	const React = await import("react");

	type DropdownContextValue = {
		open: boolean;
		setOpen: (open: boolean) => void;
	};

	const DropdownContext = React.createContext<DropdownContextValue | null>(null);

	return {
		DropdownMenu: ({ children }: { children: ReactNode }): ReactElement => {
			const [open, setOpen] = React.useState(false);
			return (
				<DropdownContext.Provider value={{ open, setOpen }}>
					<div>{children}</div>
				</DropdownContext.Provider>
			);
		},
		DropdownMenuTrigger: ({
			children,
			render,
		}: {
			children?: ReactNode;
			render?: ReactElement;
		}): ReactElement => {
			const context = React.useContext(DropdownContext);
			if (!context) {
				throw new Error("DropdownMenuTrigger must be used within DropdownMenu");
			}

			if (render) {
				return React.cloneElement(render, {
					...render.props,
					children,
					onClick: () => context.setOpen(!context.open),
				});
			}

			return (
				<button type="button" onClick={() => context.setOpen(!context.open)}>
					{children}
				</button>
			);
		},
		DropdownMenuContent: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement | null => {
			const context = React.useContext(DropdownContext);
			return context?.open ? <div>{children}</div> : null;
		},
		DropdownMenuItem: ({
			children,
			onClick,
			render,
		}: {
			children?: ReactNode;
			onClick?: () => void;
			render?: ReactElement;
		}): ReactElement => {
			if (render) {
				return React.cloneElement(render, {
					...render.props,
					children,
					onClick,
				});
			}
			return (
				<button type="button" onClick={onClick}>
					{children}
				</button>
			);
		},
		DropdownMenuSeparator: (): ReactElement => <hr />,
	};
});

vi.mock("@/components/ui/dialog", async () => {
	const React = await import("react");

	type DialogContextValue = {
		open: boolean;
		setOpen: (open: boolean) => void;
	};

	const DialogContext = React.createContext<DialogContextValue | null>(null);

	return {
		Dialog: ({
			children,
			open,
			onOpenChange,
		}: {
			children: ReactNode;
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}): ReactElement => {
			const [internalOpen, setInternalOpen] = React.useState(open ?? false);
			const isOpen = open ?? internalOpen;

			return (
				<DialogContext.Provider
					value={{
						open: isOpen,
						setOpen(nextOpen) {
							onOpenChange?.(nextOpen);
							if (open === undefined) {
								setInternalOpen(nextOpen);
							}
						},
					}}
				>
					{children}
				</DialogContext.Provider>
			);
		},
		DialogContent: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement | null => {
			const context = React.useContext(DialogContext);
			return context?.open ? <div>{children}</div> : null;
		},
		DialogDescription: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement => <p>{children}</p>,
		DialogFooter: ({ children }: { children: ReactNode }): ReactElement => (
			<div>{children}</div>
		),
		DialogHeader: ({ children }: { children: ReactNode }): ReactElement => (
			<div>{children}</div>
		),
		DialogTitle: ({ children }: { children: ReactNode }): ReactElement => (
			<h2>{children}</h2>
		),
	};
});

describe("AppSidebar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sidebarMocks.useRouterState.mockReturnValue({
			location: { pathname: "/browse" },
		});
		sidebarMocks.authStatus.mockResolvedValue({ signedIn: false });
		sidebarMocks.authSignIn.mockResolvedValue({ signedIn: false });
		sidebarMocks.authCompleteSignIn.mockResolvedValue({ ok: true });
		sidebarMocks.authSignOut.mockResolvedValue({ signedIn: false });
		vi.stubGlobal("__SWANKI_NAVIGATE__", vi.fn());
		Object.defineProperty(globalThis, "electronAPI", {
			configurable: true,
			value: {
				authStatus: sidebarMocks.authStatus,
				authSignIn: sidebarMocks.authSignIn,
				authCompleteSignIn: sidebarMocks.authCompleteSignIn,
				authSignOut: sidebarMocks.authSignOut,
			},
		});
	});

	it("marks the active navigation link and signs out on the web platform", async () => {
		const screen = await renderWithProviders(
			<AppSidebar user={{ name: "Test User", email: "test@example.com" }} />,
		);

		await expect.element(screen.getByRole("link", { name: "Browse" })).toHaveAttribute(
			"aria-current",
			"page",
		);

		await screen.getByRole("button", { name: /test user/i }).click();
		await screen.getByRole("button", { name: "Sign out" }).click();

		expect(sidebarMocks.signOut).toHaveBeenCalledTimes(1);
	});

	it("starts desktop sign-in and opens the merge dialog when local data exists", async () => {
		sidebarMocks.authStatus.mockResolvedValue({ signedIn: false });
		sidebarMocks.authSignIn.mockResolvedValue({
			signedIn: true,
			hasLocalData: true,
			user: { name: "Desktop User", email: "desktop@example.com" },
		});

		const screen = await renderWithProviders(
			<AppSidebar user={{ name: "Test User", email: "test@example.com" }} />,
			{ platform: "desktop" },
		);

		await screen.getByRole("button", { name: /test user/i }).click();
		await screen.getByRole("button", { name: "Sign in" }).click();

		await expect.element(screen.getByRole("heading", { name: "Existing Local Data" })).toBeVisible();
		await screen.getByRole("button", { name: "Merge Data" }).click();

		expect(sidebarMocks.authCompleteSignIn).toHaveBeenCalledWith({
			strategy: "merge",
		});
	});
});
