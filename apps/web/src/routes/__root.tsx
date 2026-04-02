import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";

const queryClient = new QueryClient();

const isMobile = import.meta.env.VITE_PLATFORM === "mobile";

// Lazy-load MobileInitProvider — only bundled in mobile builds
const MobileInitProvider = isMobile
	? lazy(async () => {
			const m = await import("@/lib/mobile/mobile-init-provider");
			return { default: m.MobileInitProvider };
		})
	: null;

export const Route = createRootRoute({
	beforeLoad: async () => {
		// SPA mode (mobile) — server functions unavailable
		if (isMobile) {
			return { theme: "system" as const };
		}
		// Dynamic import to avoid pulling in DB module graph in mobile builds
		const { getUserTheme } = await import("@/lib/auth-session");
		const theme = await getUserTheme();
		return { theme: theme as "light" | "dark" | "system" };
	},
	head: () => ({
		meta: [
			{ charSet: "utf8" },
			{
				name: "viewport",
				content:
					"width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
			},
			{ title: "Swanki" },
		],
		links: [{ rel: "stylesheet", href: "/src/styles/globals.css" }],
	}),
	component: RootComponent,
});

// Inline script to handle "system" mode before paint.
const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,c=d.classList;if(!c.contains('dark')&&!c.contains('light')){if(window.matchMedia('(prefers-color-scheme:dark)').matches)c.add('dark')}})();`;

function RootComponent(): React.ReactElement {
	// oxlint-disable-next-line typescript-eslint(no-unnecessary-type-assertion) -- conflicts with no-unsafe-assignment without this cast
	const routeContext = Route.useRouteContext() as {
		theme: "light" | "dark" | "system";
	};
	const typedTheme = routeContext.theme;

	let htmlClass: string | undefined;
	if (typedTheme === "dark") {
		htmlClass = "dark";
	} else if (typedTheme === "light") {
		htmlClass = "light";
	}

	const appContent = (
		<ThemeProvider initialTheme={typedTheme}>
			<TooltipProvider>
				<Outlet />
			</TooltipProvider>
		</ThemeProvider>
	);

	return (
		<html lang="en" className={htmlClass}>
			<head>
				<HeadContent />
				{/* oxlint-disable-next-line react/no-danger -- hardcoded constant, not user input */}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
			</head>
			<body>
				{isMobile && MobileInitProvider ? (
					<Suspense
						fallback={
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									height: "100vh",
								}}
							>
								Loading...
							</div>
						}
					>
						<MobileInitProvider>{appContent}</MobileInitProvider>
					</Suspense>
				) : (
					<QueryClientProvider client={queryClient}>
						{appContent}
					</QueryClientProvider>
				)}
				<Scripts />
			</body>
		</html>
	);
}
