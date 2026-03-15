import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
} from "@tanstack/react-router";
import { DesktopShell } from "./components/desktop-shell";

// Pages that don't use route-specific hooks can be imported directly
import { Dashboard } from "@/routes/_authenticated/index";
import { StatsPage } from "@/routes/_authenticated/stats";
import { ImportPage } from "@/routes/_authenticated/import";
import { NoteTypesPage } from "@/routes/_authenticated/note-types/index";

// Pages that use Route.useParams/useSearch/useRouteContext need desktop wrappers
import { DesktopStudyPage } from "./pages/study-page";
import { DesktopBrowsePage } from "./pages/browse-page";
import { DesktopSettingsPage } from "./pages/settings-page";

// Hardcoded user for desktop (no auth required)
const desktopUser = { name: "Local User", email: "local@swanki.app" };

function RootComponent(): React.ReactElement {
  return (
    <DesktopShell user={desktopUser}>
      <Outlet />
    </DesktopShell>
  );
}

const rootRoute = createRootRoute({ component: RootComponent });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});

const studyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/study/$deckId",
  component: DesktopStudyPage,
});

const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/browse",
  component: DesktopBrowsePage,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
    page:
      typeof search.page === "number" && search.page > 0
        ? search.page
        : undefined,
  }),
});

const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stats",
  component: StatsPage,
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/import",
  component: ImportPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: DesktopSettingsPage,
});

const noteTypesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/note-types",
  component: NoteTypesPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  studyRoute,
  browseRoute,
  statsRoute,
  importRoute,
  settingsRoute,
  noteTypesRoute,
]);

export const router = createRouter({ routeTree });
