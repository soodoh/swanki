import { PlatformProvider } from "@swanki/core/platform";
import type { AppTransport } from "@swanki/core/transport";
import { TransportProvider } from "@swanki/core/transport";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: 1000 * 60 * 5, retry: false },
	},
});

/**
 * MobileProvider wraps the app in the same provider hierarchy as
 * DesktopProvider (QueryClient + Transport + Platform).
 *
 * The transport is passed in rather than created here because it
 * depends on the async database initialization.
 */
export function MobileProvider({
	transport,
	children,
}: {
	transport: AppTransport;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<QueryClientProvider client={queryClient}>
			<TransportProvider value={transport}>
				<PlatformProvider value="mobile">{children}</PlatformProvider>
			</TransportProvider>
		</QueryClientProvider>
	);
}
