import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();

    if (!session) {
      // eslint-disable-next-line only-throw-error -- TanStack Router requires throwing redirect()
      throw redirect({ to: "/login" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout(): React.ReactElement {
  return <Outlet />;
}
