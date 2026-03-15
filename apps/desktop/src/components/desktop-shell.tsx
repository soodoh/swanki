import { Titlebar } from "./titlebar";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/lib/theme";

type DesktopShellProps = {
  user: { name: string; email: string; image?: string };
  children: React.ReactNode;
};

export function DesktopShell({
  user,
  children,
}: DesktopShellProps): React.ReactElement {
  return (
    <ThemeProvider initialTheme="system">
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Titlebar />
        <div className="flex-1 overflow-hidden">
          <AppShell user={user}>{children}</AppShell>
        </div>
      </div>
    </ThemeProvider>
  );
}
