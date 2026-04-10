import { PlatformProvider } from "@swanki/core/platform";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render } from "vitest-browser-react";

import { ThemeProvider } from "@/lib/theme";

export function renderWithProviders(ui: ReactElement) {
	const queryClient = new QueryClient();

	return render(
		<QueryClientProvider client={queryClient}>
			<PlatformProvider value="web">
				<ThemeProvider initialTheme="system">{ui}</ThemeProvider>
			</PlatformProvider>
		</QueryClientProvider>,
	);
}
