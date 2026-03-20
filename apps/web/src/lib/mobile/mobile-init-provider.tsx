/**
 * MobileInitProvider — handles async mobile database initialization.
 *
 * This module is ONLY imported in mobile builds (VITE_PLATFORM=mobile)
 * via dynamic import. The web SSR build never touches this code.
 *
 * Initialization flow:
 * 1. Open Capacitor SQLite database
 * 2. Run migrations
 * 3. Instantiate MobileTransport with local user
 * 4. Render children with TransportProvider + PlatformProvider
 */
import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppTransport } from "@swanki/core/transport";
import { TransportProvider } from "@swanki/core/transport";
import { PlatformProvider } from "@swanki/core/platform";

const LOCAL_USER_ID = "local-mobile-user";
const MEDIA_DIR = "media";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: false },
  },
});

type InitState =
  | { status: "loading" }
  | { status: "ready"; transport: AppTransport }
  | { status: "error"; error: string };

export function MobileInitProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = useState<InitState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      try {
        // Dynamic imports — only loaded at runtime on mobile
        const { initMobileDb } = await import("./mobile-db");
        const { MobileTransport } = await import("./mobile-transport");
        const { capacitorFs } = await import("./capacitor-filesystem");

        const { db, rawDb } = await initMobileDb();

        if (cancelled) {
          return;
        }

        const transport = new MobileTransport(
          db,
          rawDb,
          LOCAL_USER_ID,
          MEDIA_DIR,
          capacitorFs,
        );

        setState({ status: "ready", transport });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Failed to initialize database";
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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <p style={{ color: "red", fontWeight: "bold" }}>
          Failed to start Swanki
        </p>
        <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
          {state.error}
        </p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TransportProvider value={state.transport}>
        <PlatformProvider value="mobile">{children}</PlatformProvider>
      </TransportProvider>
    </QueryClientProvider>
  );
}
