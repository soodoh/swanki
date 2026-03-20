import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronsUpDown,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Search,
  Settings,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { usePlatform } from "@swanki/core/platform";
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

  useEffect(() => {
    if (platform === "desktop") {
      const api = (
        globalThis as unknown as {
          electronAPI: {
            authStatus(): Promise<{ signedIn: boolean }>;
          };
        }
      ).electronAPI;
      void (async () => {
        const s = await api.authStatus();
        setDesktopSignedIn(s.signedIn);
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
          authSignIn(): Promise<{ signedIn: boolean }>;
        };
      }
    ).electronAPI.authSignIn();
    setDesktopSignedIn(result.signedIn);
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
      globalThis.location.href = "/";
    } else {
      await authClient.signOut();
      globalThis.location.href = "/login";
    }
  }

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
                  {user.image && (
                    <AvatarImage src={user.image} alt={user.name} />
                  )}
                  <AvatarFallback className="rounded-lg">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
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
    </Sidebar>
  );
}
