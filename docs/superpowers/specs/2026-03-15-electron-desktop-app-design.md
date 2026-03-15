# Electron Desktop App — Design Spec

**Date:** 2026-03-15
**Status:** Draft

## Overview

Add an Electron desktop app to the Swanki monorepo that shares code with the existing web app. The desktop app works fully offline with a local SQLite database, with optional cloud sync via sign-in. As part of this work, consolidate both apps onto Node.js + `better-sqlite3`, eliminating the `bun:sqlite` dependency.

### Goals

- Full feature parity with the web app (study, browse, import, stats, note types)
- Offline-first: works without an account or internet connection
- Optional cloud sync when signed in
- Maximum code sharing between web and desktop
- Cross-platform: macOS, Windows, Linux

### Non-Goals

- Mobile app (future work)
- Real-time collaboration / multi-device conflict resolution
- Server-side rendering in the desktop app

## Architecture

### Monorepo Structure

```
packages/
  core/                              # NEW: shared business logic
    src/
      db/
        schema.ts                    # moved from apps/web/src/db/schema.ts
        auth-schema.ts               # moved from apps/web/src/db/auth-schema.ts
        index.ts                     # NEW: createDb() factory, AppDb type
      services/
        deck-service.ts              # moved from apps/web/src/lib/services/
        study-service.ts
        card-service.ts
        note-service.ts
        note-type-service.ts
        browse-service.ts
        stats-service.ts
        import-service.ts
        media-service.ts
        upload-service.ts
        sync-service.ts
        user-settings-service.ts
      lib/
        fsrs.ts                      # moved from apps/web/src/lib/fsrs.ts
        template-renderer.ts         # moved from apps/web/src/lib/template-renderer.ts
        sanitize.ts                  # moved from apps/web/src/lib/sanitize.ts
      import/
        apkg-parser.ts               # moved from apps/web/src/lib/import/
      transport.ts                   # NEW: AppTransport interface
      platform.ts                    # NEW: Platform context (web vs desktop)
    package.json                     # "@swanki/core"
    tsconfig.json

apps/
  web/                               # existing, updated
    src/
      db/index.ts                    # simplified: imports createDb from @swanki/core
      routes/                        # unchanged
      lib/
        hooks/                       # refactored: use useTransport()
        offline/                     # unchanged (SQL.js, web-only)
        auth.ts                      # unchanged
        transport.ts                 # NEW: WebTransport + LocalQueryRouter
      components/                    # unchanged, shared by desktop via imports

  desktop/                           # NEW: Electron app
    electron/
      main.ts                        # main process entry
      db.ts                          # createDb() call with desktop path
      ipc-handlers.ts                # routes IPC to @swanki/core services
      local-user.ts                  # offline user management
      window-state.ts                # persist/restore window bounds
      sync.ts                        # optional cloud sync
      auth.ts                        # auth window + token storage
      updater.ts                     # auto-update
    src/
      preload.ts                     # contextBridge
      main.tsx                       # renderer entry
      routes.tsx                     # TanStack Router (client-only)
      transport.ts                   # IpcTransport
      providers/
        desktop-provider.tsx         # IpcTransportProvider + user context
      components/
        titlebar.tsx                 # custom frameless titlebar
        desktop-shell.tsx            # wraps AppShell with titlebar
    forge.config.ts
    vite.main.config.ts
    vite.renderer.config.ts
    vite.preload.config.ts
    package.json
```

### Process Model

```
Main Process (Node.js)
  ├── better-sqlite3 + Drizzle ORM
  ├── @swanki/core service instances
  ├── IPC handlers
  ├── Window management
  ├── Auto-updater
  └── Optional: cloud sync engine
         │
         │ IPC (contextBridge)
         │
Preload Script
  └── Exposes window.electronAPI
         │
Renderer Process (Chromium)
  ├── Same React components as web
  ├── IpcTransport → useTransport()
  ├── TanStack Router (client-only)
  └── Custom frameless titlebar
```

## Runtime Consolidation

Both apps consolidate onto Node.js + `better-sqlite3`, eliminating the `bun:sqlite` dependency.

| Aspect                  | Before                   | After                                                             |
| ----------------------- | ------------------------ | ----------------------------------------------------------------- |
| Web server runtime      | Bun                      | Node.js                                                           |
| SQLite driver (web)     | `bun:sqlite`             | `better-sqlite3`                                                  |
| SQLite driver (desktop) | n/a                      | `better-sqlite3`                                                  |
| Drizzle adapter         | `drizzle-orm/bun-sqlite` | `drizzle-orm/better-sqlite3` everywhere                           |
| Nitro preset            | `"bun"`                  | `"node-server"`                                                   |
| `AppDb` type            | n/a                      | `BetterSQLite3Database<typeof schema>` — concrete, no abstraction |

Bun remains the package manager and script runner. Only the server runtime changes.

### Shared DB Factory

```typescript
// packages/core/src/db/index.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function createDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type AppDb = ReturnType<typeof createDb>;
```

- Web: `createDb("data/sqlite.db")`
- Desktop: `createDb(join(app.getPath('userData'), 'swanki.db'))`
- Tests: `createDb(":memory:")`

### Benefits

- One SQLite driver, one Drizzle adapter, one DB type — no generic abstraction needed
- Tests use the same driver as production (eliminates `bun:sqlite` / `better-sqlite3` divergence)
- `better-sqlite3` has proper TypeScript definitions — removes all `oxlint-disable` comments for `bun:sqlite` type issues
- Migration runner identical everywhere: `drizzle-orm/better-sqlite3/migrator`

## Transport Abstraction

### Interface

```typescript
// packages/core/src/transport.ts
export interface AppTransport {
  query<T>(endpoint: string, params?: Record<string, string>): Promise<T>;
  mutate<T>(
    endpoint: string,
    method: "POST" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<T>;
}
```

### Web Implementation

```typescript
// apps/web/src/lib/transport.ts
export class WebTransport implements AppTransport {
  constructor(private offline: OfflineContextValue) {}

  async query<T>(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = params
      ? `${endpoint}?${new URLSearchParams(params)}`
      : endpoint;
    const localQuery = resolveLocalQuery(endpoint, params);

    return offlineQuery({
      serverFetch: async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`GET ${url} failed`);
        return res.json() as Promise<T>;
      },
      localQuery,
      db: this.offline.db,
      isOnline: this.offline.isOnline,
      isLocalReady: this.offline.isLocalReady,
    });
  }

  async mutate<T>(
    endpoint: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    const localMutation = resolveLocalMutation(endpoint, method);
    const queueEntry = resolveQueueEntry(endpoint, method, body);

    return offlineMutation(
      {
        serverFetch: async (input) => {
          const res = await fetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          if (!res.ok) throw new Error(`${method} ${endpoint} failed`);
          return res.json() as Promise<T>;
        },
        localMutation,
        queueEntry: () => queueEntry,
        db: this.offline.db,
        isOnline: this.offline.isOnline,
        queue: this.offline.queue,
        persist: this.offline.persist,
      },
      body,
    );
  }
}
```

The `resolveLocalQuery` / `resolveLocalMutation` functions are a router that maps endpoint patterns to local SQL.js query/mutation functions, consolidating the mapping logic that currently lives inline in every hook.

### Desktop Implementation

```typescript
// apps/desktop/src/transport.ts
export class IpcTransport implements AppTransport {
  async query<T>(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<T> {
    return window.electronAPI.invoke("db:query", { endpoint, params });
  }

  async mutate<T>(
    endpoint: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    return window.electronAPI.invoke("db:mutate", { endpoint, method, body });
  }
}
```

### Transport Provider

```typescript
// packages/core/src/transport.ts
const TransportContext = createContext<AppTransport>(null!);
export const useTransport = () => useContext(TransportContext);
export const TransportProvider = TransportContext.Provider;
```

Each app wraps the tree:

```tsx
// Web: _authenticated.tsx
<OfflineProvider userId={user.id}>
  <WebTransportProvider>
    <AppShell user={user}><Outlet /></AppShell>
  </WebTransportProvider>
</OfflineProvider>

// Desktop: app.tsx
<IpcTransportProvider>
  <DesktopShell user={user}><Router /></DesktopShell>
</IpcTransportProvider>
```

### Shared Hooks

Hooks become transport-agnostic and can live in `packages/core`:

```typescript
// packages/core/src/hooks/use-decks.ts
export function useDecks() {
  const transport = useTransport();
  return useQuery({
    queryKey: ["decks"],
    queryFn: () => transport.query<DeckTreeNode[]>("/api/decks"),
  });
}

export function useCreateDeck() {
  const transport = useTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; parentId?: number }) =>
      transport.mutate<DeckTreeNode>("/api/decks", "POST", data),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["decks"] }),
  });
}
```

## IPC Handler Design

The main process receives transport calls and routes them to services:

```typescript
// apps/desktop/electron/ipc-handlers.ts
export function registerIpcHandlers(db: AppDb, userId: string) {
  const deckService = new DeckService(db, mediaDir);
  const studyService = new StudyService(db);
  const noteService = new NoteService(db);
  // ... all services

  ipcMain.handle("db:query", async (_event, { endpoint, params }) => {
    if (endpoint === "/api/decks") return deckService.getDeckTree(userId);
    if (endpoint.match(/^\/api\/study\/(\d+)$/)) {
      const deckId = parseInt(endpoint.split("/").pop()!);
      return studyService.getStudySession(userId, deckId);
    }
    if (endpoint === "/api/browse") return browseService.search(userId, params);
    if (endpoint === "/api/stats") return statsService.getStats(userId);
    // ... all query routes
  });

  ipcMain.handle("db:mutate", async (_event, { endpoint, method, body }) => {
    if (endpoint === "/api/decks" && method === "POST") {
      return deckService.create(userId, body);
    }
    if (endpoint.match(/^\/api\/decks\/(\d+)$/) && method === "PUT") {
      const deckId = parseInt(endpoint.split("/").pop()!);
      return deckService.update(userId, deckId, body);
    }
    // ... all mutation routes
  });
}
```

Same endpoint strings as the web API — hooks don't need to know which environment they're in.

## Custom Frameless Window

### Window Configuration

```typescript
// main.ts — macOS uses hidden titlebar (keeps native traffic lights),
// Windows/Linux uses fully frameless with custom controls
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  frame: false,
  titleBarStyle: "hidden",
  trafficLightPosition: { x: 16, y: 16 },
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
  },
});
```

### Titlebar Component

The titlebar sits above the existing `AppShell`. It handles:

- **macOS:** Native traffic lights positioned within the titlebar. The bar is a drag region with a centered "Swanki" label.
- **Windows/Linux:** Custom minimize, maximize/restore, and close buttons on the right side. The close button has a destructive hover style.

`WebkitAppRegion: "drag"` makes the bar draggable (moves the window). Buttons use `WebkitAppRegion: "no-drag"` so they remain clickable.

### DesktopShell

```tsx
function DesktopShell({ user, children }) {
  return (
    <div className="flex flex-col h-screen">
      <Titlebar />
      <div className="flex-1 overflow-hidden">
        <AppShell user={user}>{children}</AppShell>
      </div>
    </div>
  );
}
```

### Window State Persistence

Window size, position, and maximized state are saved to a JSON file at `app.getPath('userData')/window-state.json` on close and restored on launch.

### Window Controls IPC

```typescript
// preload.ts
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  invoke: (channel: string, args: unknown) => ipcRenderer.invoke(channel, args),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  onMaximizedChange: (cb: (maximized: boolean) => void) =>
    ipcRenderer.on("window:maximized-changed", (_e, val) => cb(val)),
  onSyncStatus: (cb: (status: string) => void) =>
    ipcRenderer.on("sync:status", (_e, status) => cb(status)),
  onUpdateReady: (cb: () => void) => ipcRenderer.on("update:ready", () => cb()),
});
```

## Desktop Auth & Cloud Sync

### Auth Model

Two modes:

1. **Offline (default):** Local-only user created on first launch. No account needed. Full feature access.
2. **Signed in:** Authenticated with cloud server. Sync engine pushes/pulls between local DB and remote.

### Auth Flow

1. User clicks "Sign in" in the sidebar
2. Main process opens a modal `BrowserWindow` pointing to the cloud server's login page (e.g., `https://swanki.app/login?desktop=true`)
3. User authenticates via email/password or OAuth (Google/GitHub) — existing better-auth flow
4. On successful auth, main process intercepts the session cookie from the auth window
5. Session token stored securely via `safeStorage.encryptString()` (OS keychain on macOS, DPAPI on Windows, libsecret on Linux)
6. Auth window closes

### Token Storage

Encrypted session tokens stored at `app.getPath('userData')/.auth`. Encrypted/decrypted via Electron's `safeStorage` API which delegates to the OS credential store.

### Cloud Sync

When signed in, reuses `SyncService` from `@swanki/core`:

- **Pull:** `fetch("https://swanki.app/api/sync/pull", { headers: { Cookie: ... } })` → apply to local `better-sqlite3` DB
- **Push:** Local mutations are authoritative. Conflicts resolved by "local wins."

Sync triggers:

- On sign-in (full pull)
- Every 5 minutes while signed in (delta pull/push)
- On app focus
- Manual "Sync Now" button

### Offline → Signed-In Migration

On first sign-in:

1. Local data has a local-only `userId`
2. Cloud server creates the user account
3. Desktop updates all local records' `userId` to match cloud
4. Full push of local data to cloud
5. Normal sync from then on

Signing out keeps local data and reverts to offline mode.

## Renderer & Component Sharing

### Import Strategy

The desktop renderer imports web app components via Vite path aliases:

```typescript
// apps/desktop/vite.renderer.config.ts
resolve: {
  alias: {
    "@/": path.resolve(__dirname, "../web/src/"),
    "@swanki/core": path.resolve(__dirname, "../../packages/core/src"),
  },
}
```

All `@/components/...`, `@/lib/...` imports resolve to web app source. No duplication.

### Desktop Routing

The desktop app defines its own TanStack Router route tree (client-only, no TanStack Start / SSR):

```typescript
// apps/desktop/src/routes.tsx
import { DeckListPage } from "@/routes/_authenticated/index";
import { StudyPage } from "@/routes/_authenticated/study.$deckId";
import { BrowsePage } from "@/routes/_authenticated/browse";
// ... etc

const rootRoute = createRootRoute({ component: DesktopShell });
const indexRoute = createRoute({ path: "/", component: DeckListPage });
// ... etc
```

### Page Component Export Pattern

Web page components need a named export so the desktop router can import them:

```typescript
// Before (web)
function BrowsePage() { ... }
export const Route = createFileRoute(...)({ component: BrowsePage });

// After (web) — add export keyword
export function BrowsePage() { ... }
export const Route = createFileRoute(...)({ component: BrowsePage });
```

### Platform Detection

```typescript
// packages/core/src/platform.ts
export type Platform = "web" | "desktop";
const PlatformContext = createContext<Platform>("web");
export const usePlatform = () => useContext(PlatformContext);
```

Used sparingly — only where behavior genuinely differs (auth UI, file picker for import, media URLs).

## Import in Desktop

The import pipeline runs entirely in the main process:

1. Renderer requests file picker via IPC
2. Main process opens native `dialog.showOpenDialog` with `.apkg`/`.colpkg` filter
3. Main process reads file, calls `apkg-parser` from `@swanki/core`
4. Main process calls `ImportService` directly against `better-sqlite3`
5. Media files written to `app.getPath('userData')/media/`
6. Progress streamed to renderer via IPC events

The web app's drag-and-drop upload step is replaced in the desktop context with the native file dialog. The rest of the import wizard (preview, field mapping, confirmation) reuses the same components.

## Media in Desktop

### Storage

```
~/Library/Application Support/Swanki/    (macOS)
%APPDATA%/Swanki/                        (Windows)
~/.config/Swanki/                        (Linux)
├── swanki.db
└── media/
    ├── image_abc123.jpg
    ├── audio_def456.mp3
    └── ...
```

### Custom Protocol

```typescript
// main.ts
protocol.handle("swanki-media", (request) => {
  const filename = request.url.replace("swanki-media://", "");
  const filePath = join(app.getPath("userData"), "media", filename);
  return net.fetch(`file://${filePath}`);
});
```

Web uses `/api/media/filename.jpg`. Desktop uses `swanki-media://filename.jpg`. The media URL is resolved based on platform context.

### Service Abstraction

`DeckService` (and other services that touch media files) receive `mediaDir` as a constructor parameter instead of hardcoding `process.cwd()`:

- Web: `join(process.cwd(), "data", "media")`
- Desktop: `join(app.getPath('userData'), "media")`

## Build & Packaging

### Electron Forge

```typescript
// apps/desktop/forge.config.ts
export default {
  packagerConfig: {
    name: "Swanki",
    icon: "./assets/icon",
    asar: true,
    extraResource: ["./drizzle"], // migration files
  },
  makers: [
    new MakerSquirrel({ setupIcon: "./assets/icon.ico" }), // Windows
    new MakerDMG({ icon: "./assets/icon.icns" }), // macOS
    new MakerDeb({ options: { icon: "./assets/icon.png" } }), // Linux .deb
    new MakerRpm({ options: { icon: "./assets/icon.png" } }), // Linux .rpm
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "electron/main.ts", config: "vite.main.config.ts" },
        { entry: "src/preload.ts", config: "vite.preload.config.ts" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
    new FusesPlugin({
      RunAsNode: false,
      EnableNodeCliInspectArguments: false,
    }),
  ],
};
```

### Auto-Updates

`electron-updater` with GitHub Releases as the update source. Checks on launch and every 4 hours. Downloads in the background. Prompts user to restart when ready.

### Native Module Handling

`better-sqlite3` is a native Node addon rebuilt for Electron's Node version. Electron Forge handles `electron-rebuild` automatically during packaging.

## Testing Strategy

### Test Layers

**Unit tests (`packages/core`):**

- Services, FSRS, template renderer, import parser
- In-memory `better-sqlite3` — same driver as production
- Run with `vitest` from `packages/core`

**Integration tests (`apps/web`):**

- API route → service → DB roundtrips
- Existing tests stay, updated to import from `@swanki/core`

**Desktop tests (`apps/desktop`):**

- IPC routing tests (mock services, verify routing)
- Thin layer — services tested in `packages/core`

**E2E tests:**

- Web: existing Playwright tests, unchanged
- Desktop: Playwright with `_electron.launch()` for Electron-specific E2E

### Turborepo Pipeline

`bun run test` from root runs all tests in parallel. `packages/core` tests run first, then app tests.

## Key Dependencies

### New (apps/desktop)

| Package                          | Purpose                 |
| -------------------------------- | ----------------------- |
| `electron`                       | Desktop runtime         |
| `@electron-forge/cli`            | Build, package, publish |
| `@electron-forge/plugin-vite`    | Vite integration        |
| `@electron-forge/maker-squirrel` | Windows installer       |
| `@electron-forge/maker-dmg`      | macOS installer         |
| `@electron-forge/maker-deb`      | Linux .deb              |
| `@electron-forge/maker-rpm`      | Linux .rpm              |
| `electron-updater`               | Auto-updates            |

### Moved to packages/core

| Package                | Currently in               |
| ---------------------- | -------------------------- |
| `better-sqlite3`       | `apps/web` devDependencies |
| `drizzle-orm`          | `apps/web` dependencies    |
| `ts-fsrs`              | `apps/web` dependencies    |
| `fflate`               | `apps/web` dependencies    |
| `fzstd`                | `apps/web` dependencies    |
| `isomorphic-dompurify` | `apps/web` dependencies    |

### Removed from apps/web

| Package               | Reason                                          |
| --------------------- | ----------------------------------------------- |
| `bun:sqlite` (import) | Replaced by `better-sqlite3` via `@swanki/core` |
