import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { getUserTheme } from "@/lib/auth-session";

const queryClient = new QueryClient();

export const Route = createRootRoute({
  beforeLoad: async () => {
    const theme = await getUserTheme();
    return { theme: theme as "light" | "dark" | "system" };
  },
  head: () => ({
    meta: [
      { charSet: "utf8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Swanki" },
    ],
    links: [{ rel: "stylesheet", href: "/src/styles/globals.css" }],
  }),
  component: RootComponent,
});

// Inline script to handle "system" mode before paint.
// Content is a hardcoded constant — not user input — so no XSS risk.
const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,c=d.classList;if(!c.contains('dark')&&!c.contains('light')){if(window.matchMedia('(prefers-color-scheme:dark)').matches)c.add('dark')}})();`;

function RootComponent(): React.ReactElement {
  const { theme } = Route.useRouteContext();

  const htmlClass =
    theme === "dark" ? "dark" : theme === "light" ? "light" : undefined;

  return (
    <html lang="en" className={htmlClass}>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider initialTheme={theme}>
            <TooltipProvider>
              <Outlet />
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
