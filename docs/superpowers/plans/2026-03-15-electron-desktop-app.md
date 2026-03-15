# Electron Desktop App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Electron desktop app to the Swanki monorepo with full feature parity, offline-first operation, and optional cloud sync — while consolidating the runtime onto Node.js + better-sqlite3.

**Architecture:** Extract shared business logic into `packages/core` (schema, services, FSRS, import parsers). Both `apps/web` and `apps/desktop` consume it. A transport abstraction (`AppTransport`) lets hooks work identically across platforms — web uses fetch + offline layer, desktop uses Electron IPC. The desktop main process runs services against `better-sqlite3` directly.

**Tech Stack:** Electron + Electron Forge (Vite plugin), better-sqlite3, Drizzle ORM, TanStack Router (client-only for desktop), React, Tailwind CSS, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-03-15-electron-desktop-app-design.md`

---

## Chunk 1: Runtime Consolidation (bun:sqlite to better-sqlite3)

This chunk switches the web app's server-side DB from `bun:sqlite` to `better-sqlite3` and the Nitro preset from `"bun"` to `"node-server"`. After this chunk, the web app works identically but on Node.js + better-sqlite3.

### Task 1: Switch DB driver to better-sqlite3

**Files:**

- Modify: `apps/web/src/db/index.ts`
- Modify: `apps/web/package.json` (move `better-sqlite3` from devDependencies to dependencies)

- [ ] **Step 1: Move better-sqlite3 to production dependencies**

In `apps/web/package.json`, move `"better-sqlite3"` from `devDependencies` to `dependencies`. Also add `"@types/better-sqlite3"` to `devDependencies`.

Run: `cd apps/web && bun install`

- [ ] **Step 2: Rewrite db/index.ts to use better-sqlite3**

Replace the entire file:

```typescript
// apps/web/src/db/index.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const envVars = process.env as Record<string, string | undefined>;
const sqlite = new Database(envVars.DATABASE_URL ?? "data/sqlite.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const rawSqlite = sqlite;
export const db = drizzle(sqlite, { schema });
```

Note: `rawSqlite` is exported so `ImportService` can use it for transactions (replaces the old `sqliteTyped` export).

- [ ] **Step 3: Verify the web app starts**

Run: `cd apps/web && bun run dev`

Visit `http://localhost:3000` and verify basic functionality. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/db/index.ts apps/web/package.json apps/web/bun.lock
git commit -m "refactor: switch db driver from bun:sqlite to better-sqlite3"
```

### Task 2: Update test utilities

**Files:**

- Modify: `apps/web/src/__tests__/test-utils.ts`

- [ ] **Step 1: Rewrite test-utils.ts to use better-sqlite3**

Replace the entire file:

```typescript
// apps/web/src/__tests__/test-utils.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../db/schema";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
```

- [ ] **Step 2: Run all tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/__tests__/test-utils.ts
git commit -m "refactor: update test utilities to use better-sqlite3"
```

### Task 3: Update ImportService transaction handling

**Files:**

- Modify: `apps/web/src/lib/services/import-service.ts`

- [ ] **Step 1: Replace sqliteTyped import with rawSqlite**

In `apps/web/src/lib/services/import-service.ts`:

Change:

```typescript
import { sqliteTyped } from "../../db";
```

To:

```typescript
import { rawSqlite } from "../../db";
```

- [ ] **Step 2: Replace all sqliteTyped transaction calls**

Replace the three transaction calls:

- `sqliteTyped.exec("BEGIN TRANSACTION")` to `rawSqlite.exec("BEGIN TRANSACTION")`
- `sqliteTyped.exec("COMMIT")` to `rawSqlite.exec("COMMIT")`
- `sqliteTyped.exec("ROLLBACK")` to `rawSqlite.exec("ROLLBACK")`

- [ ] **Step 3: Run tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/services/import-service.ts
git commit -m "refactor: update ImportService to use rawSqlite for transactions"
```

### Task 4: Switch apkg-parser.ts from bun:sqlite to better-sqlite3

**Files:**

- Modify: `apps/web/src/lib/import/apkg-parser.ts`

`apkg-parser.ts` imports `Database` from `bun:sqlite` to open temporary `.apkg` SQLite files for parsing. This must also switch to `better-sqlite3`.

- [ ] **Step 1: Replace bun:sqlite import**

In `apps/web/src/lib/import/apkg-parser.ts`, change:

```typescript
import { Database } from "bun:sqlite";
```

To:

```typescript
import Database from "better-sqlite3";
```

Note: `better-sqlite3`'s `Database` constructor takes the same `(path: string)` argument and returns a compatible synchronous API, so the rest of the parser code should work without changes. Verify that query patterns (`.prepare().all()`, `.prepare().get()`) are compatible — `better-sqlite3` uses the same method names.

- [ ] **Step 2: Run tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass.

- [ ] **Step 3: Verify import flow works**

Run: `cd apps/web && bun run dev`
Test importing an .apkg file through the UI.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/import/apkg-parser.ts
git commit -m "refactor: switch apkg-parser from bun:sqlite to better-sqlite3"
```

### Task 5: Switch Nitro preset to node-server

**Files:**

- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Change Nitro preset**

In `apps/web/vite.config.ts`, change:

```typescript
nitro({ preset: "bun" }),
```

To:

```typescript
nitro({ preset: "node-server" }),
```

- [ ] **Step 2: Update scripts to remove --bun flag**

In `apps/web/package.json`, update scripts:

- `"dev"`: `"bun --bun vite dev"` to `"bun vite dev"`
- `"build"`: `"bun --bun vite build"` to `"bun vite build"`
- `"test"`: `"bun --bun vitest"` to `"bun vitest"`
- `"test:run"`: `"bun --bun vitest run"` to `"bun vitest run"`

- [ ] **Step 3: Verify the web app starts and builds**

Run: `cd apps/web && bun run dev`

Verify it starts on port 3000. Stop it.

Run: `cd apps/web && bun run build`
Expected: Build completes without errors.

- [ ] **Step 4: Run all tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass.

- [ ] **Step 5: Run lint**

Run: `cd apps/web && bun run lint`
Expected: No new lint errors. Remove any `oxlint-disable` comments that were specifically for `bun:sqlite` type issues and are no longer needed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/vite.config.ts apps/web/package.json
git commit -m "refactor: switch Nitro preset from bun to node-server"
```

---

## Chunk 2: Extract packages/core

Move schema, services, and shared libraries into `packages/core`. After this chunk, the web app imports everything from `@swanki/core` and all tests pass.

### Task 5: Create packages/core package scaffold

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Modify: `package.json` (root workspaces)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@swanki/core",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./db": "./src/db/index.ts",
    "./db/schema": "./src/db/schema.ts",
    "./db/auth-schema": "./src/db/auth-schema.ts",
    "./services/*": "./src/services/*.ts",
    "./lib/*": "./src/lib/*.ts",
    "./import/*": "./src/import/*.ts",
    "./transport": "./src/transport.ts",
    "./platform": "./src/platform.ts",
    "./hooks/*": "./src/hooks/*.ts"
  },
  "dependencies": {
    "better-sqlite3": "^12.6.2",
    "drizzle-orm": "^0.45.1",
    "ts-fsrs": "^5.2.3",
    "fflate": "^0.8.2",
    "fzstd": "^0.1.1",
    "isomorphic-dompurify": "^3.0.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "@tanstack/react-query": "^5.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: Update root workspaces**

In root `package.json`, change:

```json
"workspaces": ["apps/*"]
```

To:

```json
"workspaces": ["apps/*", "packages/*"]
```

- [ ] **Step 4: Create src/index.ts barrel export**

```typescript
// packages/core/src/index.ts
export { createDb } from "./db/index";
export type { AppDb } from "./db/index";
```

- [ ] **Step 5: Install dependencies**

Run: `bun install` (from root)

- [ ] **Step 6: Commit**

```bash
git add packages/core/ package.json bun.lock
git commit -m "chore: scaffold packages/core package"
```

### Task 6: Move schema files to packages/core

**Files:**

- Create: `packages/core/src/db/schema.ts` (copy from web)
- Create: `packages/core/src/db/auth-schema.ts` (copy from web)
- Modify: `apps/web/src/db/schema.ts` (re-export)
- Modify: `apps/web/src/db/auth-schema.ts` (re-export)
- Modify: `apps/web/package.json` (add @swanki/core dep)

- [ ] **Step 1: Copy schema files to packages/core**

```bash
mkdir -p packages/core/src/db
cp apps/web/src/db/schema.ts packages/core/src/db/schema.ts
cp apps/web/src/db/auth-schema.ts packages/core/src/db/auth-schema.ts
```

- [ ] **Step 2: Replace web app schema files with re-exports**

Replace `apps/web/src/db/schema.ts` with:

```typescript
export * from "@swanki/core/db/schema";
```

Replace `apps/web/src/db/auth-schema.ts` with:

```typescript
export * from "@swanki/core/db/auth-schema";
```

- [ ] **Step 3: Add @swanki/core dependency to apps/web**

In `apps/web/package.json`, add to dependencies:

```json
"@swanki/core": "workspace:*"
```

Run: `bun install`

- [ ] **Step 4: Run tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass (re-exports are transparent).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/ apps/web/src/db/schema.ts apps/web/src/db/auth-schema.ts apps/web/package.json bun.lock
git commit -m "refactor: move schema files to packages/core"
```

### Task 7: Create shared DB factory in packages/core

**Files:**

- Create: `packages/core/src/db/index.ts`
- Modify: `apps/web/src/db/index.ts`
- Modify: `apps/web/src/__tests__/test-utils.ts`

- [ ] **Step 1: Create the shared createDb factory**

```typescript
// packages/core/src/db/index.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function createDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return { drizzleDb: drizzle(sqlite, { schema }), rawDb: sqlite };
}

export type AppDb = BetterSQLite3Database<typeof schema>;
```

Returns both `drizzleDb` and `rawDb` so callers can pass the raw handle to ImportService for transactions.

- [ ] **Step 2: Update apps/web/src/db/index.ts to use the factory**

```typescript
// apps/web/src/db/index.ts
import { createDb } from "@swanki/core/db";

const envVars = process.env as Record<string, string | undefined>;
const { drizzleDb, rawDb } = createDb(envVars.DATABASE_URL ?? "data/sqlite.db");

export const db = drizzleDb;
export const rawSqlite = rawDb;
```

- [ ] **Step 3: Update test-utils.ts to use createDb**

```typescript
// apps/web/src/__tests__/test-utils.ts
import { createDb } from "@swanki/core/db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export function createTestDb() {
  const { drizzleDb } = createDb(":memory:");
  migrate(drizzleDb, { migrationsFolder: "./drizzle" });
  return drizzleDb;
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/index.ts apps/web/src/db/index.ts apps/web/src/__tests__/test-utils.ts
git commit -m "refactor: create shared createDb factory in packages/core"
```

### Task 8: Move services to packages/core

**Files:**

- Create: `packages/core/src/services/` (copy all 12 service files from web)
- Modify: Each service file (update imports, use AppDb type)
- Modify: `apps/web/src/lib/services/*.ts` (replace with re-exports)
- Modify: Web API routes that instantiate services with new constructor args

This is the largest migration task. Each service file needs:

1. `BunSQLiteDatabase` type replaced with `AppDb`
2. Schema imports updated from `"../../db/schema"` to `"../db/schema"`
3. Lib imports updated (e.g., `"../../lib/fsrs"` to `"../lib/fsrs"`)

- [ ] **Step 1: Copy all service files**

```bash
mkdir -p packages/core/src/services
cp apps/web/src/lib/services/*.ts packages/core/src/services/
```

- [ ] **Step 2: Update imports in each service file**

For every file in `packages/core/src/services/`:

Replace `import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"` and `type Db = BunSQLiteDatabase<typeof schema>` with:

```typescript
import type { AppDb } from "../db/index";
type Db = AppDb;
```

Update all relative imports to match the new directory structure.

- [ ] **Step 3: Refactor DeckService constructor (add mediaDir param)**

Remove module-level `MEDIA_DIR` constant. Add `mediaDir: string` to constructor. Replace all `MEDIA_DIR` references with `this.mediaDir`.

- [ ] **Step 4: Refactor MediaService constructor (add mediaDir param)**

Same as DeckService: remove `MEDIA_DIR`, add `mediaDir` constructor param.

- [ ] **Step 5: Refactor ImportService constructor (add rawDb param)**

Remove `import { rawSqlite } from "../../db"`. Add `rawDb: Database` to constructor (import `Database` type from `better-sqlite3`). Replace `rawSqlite` references with `this.rawDb`.

- [ ] **Step 6: Refactor UploadService (add uploadDir param to functions)**

Remove module-level `UPLOAD_DIR` constant. Add `uploadDir: string` as first parameter to each exported function.

- [ ] **Step 7: Move shared lib files to packages/core**

```bash
mkdir -p packages/core/src/lib
cp apps/web/src/lib/fsrs.ts packages/core/src/lib/
cp apps/web/src/lib/template-renderer.ts packages/core/src/lib/
cp apps/web/src/lib/sanitize.ts packages/core/src/lib/
cp apps/web/src/lib/field-converter.ts packages/core/src/lib/
cp apps/web/src/lib/search-parser.ts packages/core/src/lib/
```

`search-parser.ts` is required by `browse-service.ts`. Update internal imports within all copied files.

- [ ] **Step 8: Move import parser files to packages/core**

```bash
mkdir -p packages/core/src/import
cp apps/web/src/lib/import/apkg-parser.ts packages/core/src/import/
cp apps/web/src/lib/import/apkg-parser-core.ts packages/core/src/import/
cp apps/web/src/lib/import/csv-parser.ts packages/core/src/import/
cp apps/web/src/lib/import/crowdanki-parser.ts packages/core/src/import/
cp apps/web/src/lib/import/import-job.ts packages/core/src/import/
```

**Do NOT copy** `apkg-parser-client.ts` — it imports from `sql.js` and the offline layer, making it web-only (browser-side WASM parsing). It stays in `apps/web/src/lib/import/`.

Update internal imports within copied files.

- [ ] **Step 9: Replace web app files with re-exports**

Each service file in `apps/web/src/lib/services/` becomes:

```typescript
export * from "@swanki/core/services/deck-service";
```

Each lib file becomes a re-export:

```typescript
// apps/web/src/lib/fsrs.ts
export * from "@swanki/core/lib/fsrs";
```

Same for import parser files.

- [ ] **Step 10: Update web app API routes with new constructor args**

Routes using `DeckService`: pass `join(process.cwd(), "data", "media")` as second arg.
Routes using `MediaService`: same mediaDir arg.
Routes using `ImportService`: pass `rawSqlite` as second arg.
Routes using upload functions: pass `join(process.cwd(), "data", "uploads")` as first arg.

- [ ] **Step 11: Run tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass.

- [ ] **Step 12: Run lint and verify dev server**

Run: `cd apps/web && bun run lint`
Run: `cd apps/web && bun run dev` (verify it starts, test basic flows, stop)

- [ ] **Step 13: Commit**

```bash
git add packages/core/src/ apps/web/src/lib/services/ apps/web/src/lib/fsrs.ts apps/web/src/lib/template-renderer.ts apps/web/src/lib/sanitize.ts apps/web/src/lib/field-converter.ts apps/web/src/lib/import/ apps/web/src/routes/api/
git commit -m "refactor: extract services and shared libs to packages/core"
```

---

## Chunk 3: Transport Abstraction + Hook Refactor

Create the `AppTransport` interface, implement `WebTransport`, refactor hooks to use `useTransport()`. After this chunk, the web app uses the transport abstraction and all hooks are platform-agnostic.

### Task 9: Create transport interface and provider

**Files:**

- Create: `packages/core/src/transport.ts`

- [ ] **Step 1: Create the transport module**

```typescript
// packages/core/src/transport.ts
import { createContext, useContext } from "react";

export interface AppTransport {
  query<T>(endpoint: string, params?: Record<string, string>): Promise<T>;
  mutate<T>(
    endpoint: string,
    method: "POST" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<T>;
}

const TransportContext = createContext<AppTransport>(null!);

export function useTransport(): AppTransport {
  return useContext(TransportContext);
}

export const TransportProvider = TransportContext.Provider;
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/transport.ts
git commit -m "feat: add AppTransport interface and TransportProvider"
```

### Task 10: Create platform context

**Files:**

- Create: `packages/core/src/platform.ts`

- [ ] **Step 1: Create the platform module**

```typescript
// packages/core/src/platform.ts
import { createContext, useContext } from "react";

export type Platform = "web" | "desktop";

const PlatformContext = createContext<Platform>("web");

export function usePlatform(): Platform {
  return useContext(PlatformContext);
}

export const PlatformProvider = PlatformContext.Provider;
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/platform.ts
git commit -m "feat: add Platform context for web vs desktop detection"
```

### Task 11: Implement WebTransport

**Files:**

- Create: `apps/web/src/lib/transport.ts`
- Create: `apps/web/src/lib/offline/local-router.ts`
- Modify: `apps/web/src/routes/_authenticated.tsx`

- [ ] **Step 1: Create local-router.ts scaffold**

Create `apps/web/src/lib/offline/local-router.ts` that maps endpoint strings to local SQL.js query/mutation functions. Start with all the mappings extracted from the current hooks.

- [ ] **Step 2: Create WebTransport class**

Create `apps/web/src/lib/transport.ts` implementing `AppTransport`. The `query` method uses `offlineQuery` with the local router. The `mutate` method uses `offlineMutation` with the local router.

- [ ] **Step 3: Wire TransportProvider into \_authenticated.tsx**

Add `WebTransportBridge` component that reads `OfflineContext`, creates a `WebTransport`, and wraps children with `TransportProvider` and `PlatformProvider`.

- [ ] **Step 4: Run tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass (transport layer is additive, not breaking).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/transport.ts apps/web/src/lib/offline/local-router.ts apps/web/src/routes/_authenticated.tsx
git commit -m "feat: implement WebTransport and wire TransportProvider"
```

### Task 12: Migrate hooks to use transport

**Files:**

- Modify: `apps/web/src/lib/hooks/use-decks.ts`
- Modify: `apps/web/src/lib/hooks/use-study.ts`
- Modify: `apps/web/src/lib/hooks/use-browse.ts`
- Modify: `apps/web/src/lib/hooks/use-stats.ts`
- Modify: `apps/web/src/lib/hooks/use-note-types.ts`
- Modify: `apps/web/src/lib/offline/local-router.ts`

Each hook file changes from using `useOffline()` + inline `offlineQuery/offlineMutation` to using `useTransport()`. The offline mapping logic moves to `local-router.ts`.

- [ ] **Step 1: Migrate use-decks.ts**

Replace hook implementations to use `useTransport()`. Move local query/mutation mappings to `local-router.ts`.

- [ ] **Step 2: Migrate use-study.ts**

Same pattern.

- [ ] **Step 3: Migrate use-browse.ts**

Same pattern.

- [ ] **Step 4: Migrate use-stats.ts**

Same pattern.

- [ ] **Step 5: Migrate use-note-types.ts**

Same pattern. Note type mutations are server-only (no offline), so they call `transport.mutate()` directly.

- [ ] **Step 6: Run tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass.

- [ ] **Step 7: Verify dev server and test all flows**

Run: `cd apps/web && bun run dev`
Verify: deck list, study, browse, stats, note types all work.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/hooks/ apps/web/src/lib/offline/local-router.ts
git commit -m "refactor: migrate all hooks to use transport abstraction"
```

### Task 13: Move hooks to packages/core

**Files:**

- Create: `packages/core/src/hooks/use-decks.ts` (move from web)
- Create: `packages/core/src/hooks/use-study.ts`
- Create: `packages/core/src/hooks/use-browse.ts`
- Create: `packages/core/src/hooks/use-stats.ts`
- Create: `packages/core/src/hooks/use-note-types.ts`
- Modify: `apps/web/src/lib/hooks/*.ts` (replace with re-exports)

After Task 12 migrated hooks to use `useTransport()`, they are now platform-agnostic and can move to `packages/core` so the desktop app can import them.

- [ ] **Step 1: Copy hook files to packages/core**

```bash
mkdir -p packages/core/src/hooks
cp apps/web/src/lib/hooks/use-decks.ts packages/core/src/hooks/
cp apps/web/src/lib/hooks/use-study.ts packages/core/src/hooks/
cp apps/web/src/lib/hooks/use-browse.ts packages/core/src/hooks/
cp apps/web/src/lib/hooks/use-stats.ts packages/core/src/hooks/
cp apps/web/src/lib/hooks/use-note-types.ts packages/core/src/hooks/
```

**Do NOT copy** `use-card-audio.ts` — it handles DOM audio playback and is UI-specific (not data transport). It stays in `apps/web/src/lib/hooks/`.

- [ ] **Step 2: Update imports in copied hooks**

Change `@swanki/core/transport` imports to relative `"../transport"`. Update any other relative imports to match the new location.

- [ ] **Step 3: Replace web app hooks with re-exports**

Each hook file in `apps/web/src/lib/hooks/` (except `use-card-audio.ts`) becomes:

```typescript
export * from "@swanki/core/hooks/use-decks";
```

- [ ] **Step 4: Run tests**

Run: `cd apps/web && bun run test:run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/hooks/ apps/web/src/lib/hooks/
git commit -m "refactor: move transport-agnostic hooks to packages/core"
```

### Task 14: Export page components for desktop reuse

**Files:**

- Modify: `apps/web/src/routes/_authenticated/index.tsx`
- Modify: `apps/web/src/routes/_authenticated/study.$deckId.tsx`
- Modify: `apps/web/src/routes/_authenticated/browse.tsx`
- Modify: `apps/web/src/routes/_authenticated/stats.tsx`
- Modify: `apps/web/src/routes/_authenticated/import.tsx`
- Modify: `apps/web/src/routes/_authenticated/settings.tsx`
- Modify: `apps/web/src/routes/_authenticated/note-types/index.tsx`

- [ ] **Step 1: Add export keyword to each page component**

- `index.tsx`: `function Dashboard()` to `export function Dashboard()`
- `study.$deckId.tsx`: `function StudyPage()` to `export function StudyPage()`
- `browse.tsx`: `function BrowsePage()` to `export function BrowsePage()`
- `stats.tsx`: `function StatsPage()` to `export function StatsPage()`
- `import.tsx`: `function ImportPage()` to `export function ImportPage()`
- `settings.tsx`: `function SettingsPage()` to `export function SettingsPage()`
- `note-types/index.tsx`: `function NoteTypesPage()` to `export function NoteTypesPage()`

- [ ] **Step 2: Run lint and tests**

Run: `cd apps/web && bun run lint && bun run test:run`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_authenticated/
git commit -m "refactor: export page components for desktop reuse"
```

---

## Chunk 4: Electron App Scaffold

Create `apps/desktop` with Electron Forge + Vite. After this chunk, the desktop app launches, shows a frameless window with a placeholder, and connects to a local SQLite database.

### Task 14: Initialize Electron Forge project

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/forge.config.ts`
- Create: `apps/desktop/vite.main.config.ts`
- Create: `apps/desktop/vite.renderer.config.ts`
- Create: `apps/desktop/vite.preload.config.ts`
- Create: `apps/desktop/tsconfig.json`

- [ ] **Step 1: Create package.json with dependencies**

Include: `electron`, `@electron-forge/cli`, `@electron-forge/plugin-vite`, makers (Squirrel, DMG, Deb, Rpm), `@electron-forge/plugin-fuses`, `@swanki/core`, `better-sqlite3`, React, TanStack Router, TanStack Query, Tailwind.

Scripts: `start` (electron-forge start), `package`, `make`, `publish`.

- [ ] **Step 2: Create forge.config.ts**

Per spec: VitePlugin with main/preload/renderer entries, makers, FusesPlugin with `RunAsNode: false`.

- [ ] **Step 3: Create Vite configs**

`vite.main.config.ts`: Node.js target for main process.
`vite.preload.config.ts`: Node.js target for preload.
`vite.renderer.config.ts`: Browser target with `@/` alias to `../web/src/`, `@swanki/core` alias, tailwindcss and viteReact plugins.

- [ ] **Step 4: Create tsconfig.json**

Target ES2022, moduleResolution bundler, path aliases matching Vite config.

- [ ] **Step 5: Install dependencies**

Run: `cd apps/desktop && bun install`

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/
git commit -m "chore: scaffold Electron Forge project with Vite"
```

### Task 15: Main process (DB, window, lifecycle)

**Files:**

- Create: `apps/desktop/electron/main.ts`
- Create: `apps/desktop/electron/db.ts`
- Create: `apps/desktop/electron/window-state.ts`
- Create: `apps/desktop/electron/local-user.ts`

- [ ] **Step 1: Create db.ts**

Use `createDb` from `@swanki/core/db` with path `join(app.getPath('userData'), 'swanki.db')`. Run Drizzle migrations on startup.

- [ ] **Step 2: Create local-user.ts**

`getOrCreateLocalUser(db)`: checks for existing user row, creates one if none exists, seeds default note types.

- [ ] **Step 3: Create window-state.ts**

`loadWindowState()`: reads bounds from JSON file. `saveWindowState(bounds)`: writes bounds to JSON file.

- [ ] **Step 4: Create main.ts**

App lifecycle: `app.whenReady()` creates BrowserWindow (frameless, hidden titlebar), registers media protocol (`swanki-media://`), registers IPC handlers, loads renderer.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/
git commit -m "feat: implement Electron main process with DB, user, and window"
```

### Task 16: Preload script and type declarations

**Files:**

- Create: `apps/desktop/src/preload.ts`
- Create: `apps/desktop/src/electron-api.d.ts`

- [ ] **Step 1: Create preload.ts**

Use `contextBridge.exposeInMainWorld` to expose: `platform`, `invoke`, `minimize`, `maximize`, `close`, `isMaximized`, `onMaximizedChange`, `onSyncStatus`, `onUpdateReady`.

- [ ] **Step 2: Create electron-api.d.ts**

TypeScript declarations for `window.electronAPI`.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/preload.ts apps/desktop/src/electron-api.d.ts
git commit -m "feat: add Electron preload script with IPC bridge"
```

### Task 17: IPC handlers

**Files:**

- Create: `apps/desktop/electron/ipc-handlers.ts`

- [ ] **Step 1: Create IPC handler registry**

`registerIpcHandlers(db, rawDb, userId)`: instantiates all services from `@swanki/core`, registers `db:query` and `db:mutate` handlers that route endpoint strings to service methods, registers window control handlers.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/electron/ipc-handlers.ts
git commit -m "feat: implement IPC handlers routing to core services"
```

### Task 18: Minimal renderer (hello world)

**Files:**

- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/main.tsx`

- [ ] **Step 1: Create index.html and minimal main.tsx**

Simple React root rendering "Hello Swanki Desktop" to verify Electron + Vite + React works.

- [ ] **Step 2: Verify the app launches**

Run: `cd apps/desktop && bun run start`
Expected: Electron window opens showing "Hello Swanki Desktop".

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/index.html apps/desktop/src/main.tsx
git commit -m "feat: minimal Electron renderer with hello world"
```

---

## Chunk 5: Desktop Feature Integration

Wire up the renderer with shared components, IPC transport, routing, and custom titlebar. After this chunk, the desktop app is functionally complete.

### Task 19: IpcTransport and DesktopProvider

**Files:**

- Create: `apps/desktop/src/transport.ts`
- Create: `apps/desktop/src/providers/desktop-provider.tsx`

- [ ] **Step 1: Create IpcTransport**

Implements `AppTransport` by calling `window.electronAPI.invoke("db:query", ...)` and `window.electronAPI.invoke("db:mutate", ...)`.

- [ ] **Step 2: Create DesktopProvider**

Wraps children with `QueryClientProvider`, `TransportProvider` (using IpcTransport), and `PlatformProvider` (value="desktop").

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/transport.ts apps/desktop/src/providers/
git commit -m "feat: implement IpcTransport and DesktopProvider"
```

### Task 20: Custom titlebar

**Files:**

- Create: `apps/desktop/src/components/titlebar.tsx`
- Create: `apps/desktop/src/components/desktop-shell.tsx`

- [ ] **Step 1: Create titlebar component**

Drag region with `WebkitAppRegion: "drag"`. macOS: centered title, relies on native traffic lights. Windows/Linux: custom minimize/maximize/close buttons using lucide-react icons.

- [ ] **Step 2: Create desktop-shell component**

```tsx
function DesktopShell({ children }) {
  return (
    <div className="flex flex-col h-screen">
      <Titlebar />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/
git commit -m "feat: add custom frameless titlebar with platform-specific controls"
```

### Task 21: Desktop routing and full renderer

**Files:**

- Create: `apps/desktop/src/routes.tsx`
- Modify: `apps/desktop/src/main.tsx`

- [ ] **Step 1: Create routes.tsx**

Define TanStack Router route tree (client-only). Import page components from `@/routes/_authenticated/...` (resolves to web app source via Vite alias).

Routes: `/` (Dashboard), `/study/$deckId` (StudyPage), `/browse` (BrowsePage), `/stats` (StatsPage), `/import` (ImportPage), `/settings` (SettingsPage), `/note-types` (NoteTypesPage).

- [ ] **Step 2: Update main.tsx**

Wire together: React root with `DesktopProvider` wrapping `RouterProvider`. Import Tailwind CSS from web app.

- [ ] **Step 3: Verify the full desktop app**

Run: `cd apps/desktop && bun run start`
Expected: Electron window shows deck list with sidebar, titlebar, full UI.

- [ ] **Step 4: Test core flows**

- Create a deck
- Import an .apkg file
- Study cards
- Browse notes
- View stats
- Edit note types

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/
git commit -m "feat: wire desktop renderer with shared components and routing"
```

---

## Chunk 6: Desktop Auth & Cloud Sync

Add optional sign-in and cloud sync. After this chunk, desktop users can log in and sync data with the cloud server.

### Task 22: Auth window and token storage

**Files:**

- Create: `apps/desktop/electron/auth.ts`

- [ ] **Step 1: Implement openAuthWindow**

Opens a modal BrowserWindow to the cloud server's login page. Intercepts the session cookie on successful auth.

- [ ] **Step 2: Implement secure token storage**

`storeToken(token)`, `getToken()`, `clearToken()` using Electron's `safeStorage` API (encrypts to OS keychain).

- [ ] **Step 3: Register auth IPC handlers**

`auth:sign-in`, `auth:sign-out`, `auth:status`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron/auth.ts
git commit -m "feat: implement desktop auth via browser window with secure token storage"
```

### Task 23: Cloud sync engine

**Files:**

- Create: `apps/desktop/electron/sync.ts`

- [ ] **Step 1: Implement desktop sync**

Reuse `SyncService` pull logic from `@swanki/core`. Use stored session token for auth headers. Sync triggers: on sign-in (full pull), every 5 minutes (delta), on app focus.

- [ ] **Step 2: Implement userId migration**

On first sign-in, update all local records' `userId` to match the cloud account, then full push.

- [ ] **Step 3: Register sync IPC handlers**

`sync:now`, `sync:status`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron/sync.ts
git commit -m "feat: implement desktop cloud sync with delta pull/push"
```

### Task 24: Auto-updater

**Files:**

- Create: `apps/desktop/electron/updater.ts`

- [ ] **Step 1: Set up update-electron-app**

Initialize on app ready. Check on launch and every 4 hours. Send `update:ready` to renderer.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/electron/updater.ts
git commit -m "feat: add auto-updater with update-electron-app"
```

---

## Chunk 7: Polish and Verification

### Task 25: Root monorepo scripts

**Files:**

- Modify: `package.json` (root)

- [ ] **Step 1: Add desktop scripts**

```json
"dev:desktop": "turbo dev --filter=desktop",
"build:desktop": "turbo build --filter=desktop",
"package:desktop": "cd apps/desktop && bun run package",
"make:desktop": "cd apps/desktop && bun run make"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add desktop scripts to root package.json"
```

### Task 26: Final verification

- [ ] **Step 1: Run all web tests**

Run: `cd apps/web && bun run test:run`
Expected: All pass.

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: No errors.

- [ ] **Step 3: Build web**

Run: `bun run build`
Expected: Builds successfully.

- [ ] **Step 4: Launch desktop and test all flows**

Run: `cd apps/desktop && bun run start`
Test: deck CRUD, study, browse, stats, import, note types.

- [ ] **Step 5: Package desktop for current platform**

Run: `cd apps/desktop && bun run make`
Expected: Creates installer in `out/make/`.

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final fixes from verification pass"
```
