import { PlatformProvider } from "@swanki/core/platform";
import type { AppTransport } from "@swanki/core/transport";
import { TransportProvider } from "@swanki/core/transport";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { capacitorFs } from "./capacitor-filesystem";
import { initMobileDb } from "./mobile-db";
import { MobileTransport } from "./mobile-transport";

const MEDIA_DIR = "media";
const LOCAL_USER_ID = "local-mobile-user";

type MobileState =
	| { status: "loading" }
	| { status: "ready"; transport: AppTransport }
	| { status: "error"; error: string };

const MobileReadyContext = createContext<boolean>(false);

export function useMobileReady(): boolean {
	return useContext(MobileReadyContext);
}

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: 1000 * 60 * 5, retry: false },
	},
});

/**
 * MobileInitProvider handles the async initialization of the mobile app:
 * 1. Open Capacitor SQLite database
 * 2. Run migrations
 * 3. Create/retrieve local user
 * 4. Instantiate MobileTransport
 * 5. Render children with the transport available
 *
 * Shows a loading screen until initialization completes.
 */
export function MobileInitProvider({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	const [state, setState] = useState<MobileState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;

		async function init(): Promise<void> {
			try {
				const { db, rawDb } = await initMobileDb();

				if (cancelled) return;

				const transport = new MobileTransport(
					db,
					rawDb,
					LOCAL_USER_ID,
					MEDIA_DIR,
					capacitorFs,
				);

				setState({ status: "ready", transport });
			} catch (err) {
				if (cancelled) return;
				const message =
					err instanceof Error ? err.message : "Failed to initialize database";
				setState({ status: "error", error: message });
			}
		}

		void init();
		return () => {
			cancelled = true;
		};
	}, []);

	if (state.status === "loading") {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100vh",
					fontFamily: "system-ui, sans-serif",
				}}
			>
				<p>Loading Swanki...</p>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100vh",
					fontFamily: "system-ui, sans-serif",
					padding: "2rem",
					textAlign: "center",
				}}
			>
				<div>
					<p style={{ color: "red", fontWeight: "bold" }}>
						Failed to start Swanki
					</p>
					<p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
						{state.error}
					</p>
				</div>
			</div>
		);
	}

	return (
		<QueryClientProvider client={queryClient}>
			<TransportProvider value={state.transport}>
				<PlatformProvider value="mobile">
					<MobileReadyContext value={true}>{children}</MobileReadyContext>
				</PlatformProvider>
			</TransportProvider>
		</QueryClientProvider>
	);
}
