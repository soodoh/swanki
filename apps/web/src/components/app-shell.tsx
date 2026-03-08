import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/sidebar";
import { useTheme } from "@/lib/theme";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type AppShellProps = {
  user: {
    name: string;
    email: string;
    image?: string | undefined;
  };
  children: React.ReactNode;
};

const themeOrder: Array<"light" | "dark" | "system"> = [
  "light",
  "dark",
  "system",
];
const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;
const themeLabels = {
  light: "Light",
  dark: "Dark",
  system: "System",
} as const;

export function AppShell({
  user,
  children,
}: AppShellProps): React.ReactElement {
  const { theme, setTheme } = useTheme();

  function cycleTheme(): void {
    const currentIndex = themeOrder.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    setTheme(themeOrder[nextIndex]);
  }

  const Icon = themeIcons[theme];

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <h1 className="text-sm font-medium text-muted-foreground">Swanki</h1>
          <div className="ml-auto">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={cycleTheme}
                    className="size-8"
                  />
                }
              >
                <Icon className="size-4" />
                <span className="sr-only">Theme: {themeLabels[theme]}</span>
              </TooltipTrigger>
              <TooltipContent>Theme: {themeLabels[theme]}</TooltipContent>
            </Tooltip>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
