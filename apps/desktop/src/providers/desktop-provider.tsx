import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TransportProvider } from "@swanki/core/transport";
import { PlatformProvider } from "@swanki/core/platform";
import { IpcTransport } from "../transport";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: false },
  },
});

const transport = new IpcTransport();

export function DesktopProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <TransportProvider value={transport}>
        <PlatformProvider value="desktop">{children}</PlatformProvider>
      </TransportProvider>
    </QueryClientProvider>
  );
}
