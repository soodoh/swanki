import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";

type SessionData = {
  user: {
    name: string;
    email: string;
    image?: string | undefined;
  };
};

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();

    if (!session) {
      // eslint-disable-next-line only-throw-error -- TanStack Router requires throwing redirect()
      throw redirect({ to: "/login" });
    }

    return {
      session: {
        user: {
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
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- typed via beforeLoad return
  const { session } = Route.useRouteContext();
  // oxlint-disable-next-line typescript/no-unsafe-member-access -- typed via beforeLoad return
  const user = (session as SessionData).user;

  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
