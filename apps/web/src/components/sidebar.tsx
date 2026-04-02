import { usePlatform } from "@swanki/core/platform";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	BarChart3,
	ChevronsUpDown,
	Layers,
	LayoutDashboard,
	Loader2,
	LogIn,
	LogOut,
	Search,
	Settings,
	Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

type NavItem = {
	title: string;
	url: string;
	icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
	{ title: "Decks", url: "/", icon: LayoutDashboard },
	{ title: "Browse", url: "/browse", icon: Search },
	{ title: "Import", url: "/import", icon: Upload },
	{ title: "Statistics", url: "/stats", icon: BarChart3 },
	{ title: "Note Types", url: "/note-types", icon: Layers },
	{ title: "Settings", url: "/settings", icon: Settings },
];

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((part) => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

type AppSidebarProps = {
	user: {
		name: string;
		email: string;
		image?: string | undefined;
	};
};

export function AppSidebar({ user }: AppSidebarProps): React.ReactElement {
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const platform = usePlatform();
	const [desktopSignedIn, setDesktopSignedIn] = useState(false);
	const [desktopUser, setDesktopUser] = useState<
		{ name: string; email: string; image?: string } | undefined
	>();
	const [showMergeDialog, setShowMergeDialog] = useState(false);
	const [mergeLoading, setMergeLoading] = useState(false);

	useEffect(() => {
		if (platform === "desktop") {
			const api = (
				globalThis as unknown as {
					electronAPI: {
						authStatus(): Promise<{
							signedIn: boolean;
							user?: { name: string; email: string; image?: string };
						}>;
					};
				}
			).electronAPI;
			void (async () => {
				const s = await api.authStatus();
				setDesktopSignedIn(s.signedIn);
				setDesktopUser(s.user ?? undefined);
			})();
		}
	}, [platform]);

	function isActive(url: string): boolean {
		if (url === "/") {
			return currentPath === "/";
		}
		return currentPath.startsWith(url);
	}

	async function handleSignIn(): Promise<void> {
		const result = await (
			globalThis as unknown as {
				electronAPI: {
					authSignIn(): Promise<{
						signedIn: boolean;
						hasLocalData?: boolean;
						user?: { name: string; email: string; image?: string };
					}>;
				};
			}
		).electronAPI.authSignIn();
		setDesktopSignedIn(result.signedIn);
		if (result.user) {
			setDesktopUser(result.user);
		}
		if (result.signedIn && result.hasLocalData) {
			setShowMergeDialog(true);
		}
	}

	async function handleCompleteSignIn(
		strategy: "merge" | "replace",
	): Promise<void> {
		setMergeLoading(true);
		try {
			await (
				globalThis as unknown as {
					electronAPI: {
						authCompleteSignIn(data: {
							strategy: "merge" | "replace";
						}): Promise<{ ok: boolean }>;
					};
				}
			).electronAPI.authCompleteSignIn({ strategy });
			setShowMergeDialog(false);
			// Reload to refresh React Query caches with synced data
			globalThis.location.href = "/";
		} finally {
			setMergeLoading(false);
		}
	}

	async function handleSignOut(): Promise<void> {
		if (platform === "desktop") {
			const result = await (
				globalThis as unknown as {
					electronAPI: {
						authSignOut(): Promise<{ signedIn: boolean }>;
					};
				}
			).electronAPI.authSignOut();
			setDesktopSignedIn(result.signedIn);
			setDesktopUser(undefined);
			globalThis.location.href = "/";
		} else {
			await authClient.signOut();
			globalThis.location.href = "/login";
		}
	}

	const displayUser =
		platform === "desktop" && desktopUser ? desktopUser : user;

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" tooltip="Swanki">
							<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
								<span className="text-sm font-bold">S</span>
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-semibold">Swanki</span>
								<span className="truncate text-xs text-muted-foreground">
									Spaced Repetition
								</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Navigation</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{navItems.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										tooltip={item.title}
										isActive={isActive(item.url)}
										render={<Link to={item.url} />}
									>
										<item.icon />
										<span>{item.title}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<SidebarMenuButton
										size="lg"
										className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
									/>
								}
							>
								<Avatar size="sm" className="size-8 rounded-lg">
									{displayUser.image && (
										<AvatarImage
											src={displayUser.image}
											alt={displayUser.name}
										/>
									)}
									<AvatarFallback className="rounded-lg">
										{getInitials(displayUser.name)}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">
										{displayUser.name}
									</span>
									<span className="truncate text-xs text-muted-foreground">
										{displayUser.email}
									</span>
								</div>
								<ChevronsUpDown className="ml-auto size-4" />
							</DropdownMenuTrigger>
							<DropdownMenuContent
								side="top"
								align="end"
								sideOffset={4}
								className="w-[--anchor-width] min-w-56"
							>
								<DropdownMenuItem render={<Link to="/settings" />}>
									<Settings />
									Settings
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								{platform === "desktop" && !desktopSignedIn ? (
									<DropdownMenuItem onClick={handleSignIn}>
										<LogIn />
										Sign in
									</DropdownMenuItem>
								) : (
									<DropdownMenuItem onClick={handleSignOut}>
										<LogOut />
										Sign out
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>

			<SidebarRail />

			{/* Merge/Replace dialog shown when signing in with existing local data */}
			<Dialog
				open={showMergeDialog}
				onOpenChange={(open) => {
					if (!mergeLoading) {
						setShowMergeDialog(open);
					}
				}}
			>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Existing Local Data</DialogTitle>
						<DialogDescription>
							You have flashcard data on this device. How would you like to
							handle it?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							disabled={mergeLoading}
							onClick={async () => handleCompleteSignIn("replace")}
						>
							{mergeLoading ? <Loader2 className="animate-spin" /> : null}
							Use Cloud Data
						</Button>
						<Button
							disabled={mergeLoading}
							onClick={async () => handleCompleteSignIn("merge")}
						>
							{mergeLoading ? <Loader2 className="animate-spin" /> : null}
							Merge Data
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Sidebar>
	);
}
