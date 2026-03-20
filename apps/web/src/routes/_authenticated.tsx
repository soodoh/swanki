import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { TransportProvider } from "@swanki/core/transport";
import { PlatformProvider } from "@swanki/core/platform";
import { AppShell } from "@/components/app-shell";
import { WebTransport } from "@/lib/transport";

type SessionData = {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | undefined;
  };
};

const isMobile = import.meta.env.VITE_PLATFORM === "mobile";

// Hardcoded local user for mobile (no auth required, like desktop)
const mobileUser = {
  id: "local-mobile-user",
  name: "Local User",
  email: "local@swanki.app",
};

const transport = isMobile ? undefined : new WebTransport();

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // SPA mode (mobile) — no server functions, use local user
    if (isMobile) {
      return {
        session: { user: mobileUser } satisfies SessionData,
      };
    }

    // Dynamic import to avoid pulling in DB module graph in mobile builds
    const { getSession } = await import("@/lib/auth-session");
    const session = await getSession();

    if (!session) {
      // eslint-disable-next-line only-throw-error -- TanStack Router requires throwing redirect()
      throw redirect({ to: "/login" });
    }

    return {
      session: {
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: session.user.image ?? undefined,
        },
      } satisfies SessionData,
    };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout(): React.ReactElement {
  // oxlint-disable-next-line typescript-eslint(no-unnecessary-type-assertion) -- conflicts with no-unsafe-assignment without this cast
  const routeContext = Route.useRouteContext() as { session: SessionData };
  const user = routeContext.session.user;

  // On mobile, MobileInitProvider at the app root already provides
  // TransportProvider and PlatformProvider — just render the shell
  if (isMobile) {
    return (
      <AppShell user={user}>
        <Outlet />
      </AppShell>
    );
  }

  return (
    <TransportProvider value={transport!}>
      <PlatformProvider value="web">
        <AppShell user={user}>
          <Outlet />
        </AppShell>
      </PlatformProvider>
    </TransportProvider>
  );
}
