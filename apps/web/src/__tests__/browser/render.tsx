import { PlatformProvider } from "@swanki/core/platform";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render } from "vitest-browser-react";

import { ThemeProvider } from "@/lib/theme";

type RenderWithProvidersOptions = {
	initialTheme?: "light" | "dark" | "system";
	platform?: "web" | "desktop";
};

export function renderWithProviders(
	ui: ReactElement,
	options: RenderWithProvidersOptions = {},
) {
	const {
		initialTheme = "system",
		platform = "web",
	} = options;

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<PlatformProvider value={platform}>
				<ThemeProvider initialTheme={initialTheme}>{ui}</ThemeProvider>
			</PlatformProvider>
		</QueryClientProvider>,
	);
}
