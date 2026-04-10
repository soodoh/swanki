# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Swanki is an Anki-compatible spaced repetition flashcard app. Turborepo monorepo:

- **web** (`apps/web`) — @tanstack/start + React + Tailwind CSS, SSR via Nitro (node-server preset)
- **desktop** (`apps/desktop`) — Electron app with offline-first local SQLite, built with Electron Forge + Vite
- **core** (`packages/core`) — shared services, hooks, DB schema, and utilities used by both web and desktop
- **docs** (`apps/docs`) — placeholder
- **mobile** (`apps/mobile`) — placeholder

## Build & Dev Commands

```
bun run dev:web          # web dev server (port 3000, includes sqlite rebuild)
bun run start:desktop    # start desktop dev with Electron Forge
bun run dev:desktop      # desktop dev via turbo (with rebuild)
bun run build            # build all apps
bun run build:desktop    # build desktop for distribution
bun run package:desktop  # package desktop app
bun run make:desktop     # create desktop installers (Squirrel/DMG/DEB/RPM)
bun run lint             # biome lint + format check
bun run lint:fix         # auto-fix lint and format issues
bun run test             # run tests once with coverage (vitest)
bun run test:ci          # run tests once (CI mode)
```

Single test file from `apps/web`:

```
cd apps/web && bun --bun vitest run src/__tests__/lib/fsrs.test.ts
```

### Database Migrations

Drizzle Kit manages SQLite migrations. Config at `apps/web/drizzle.config.ts`, migrations in `apps/web/drizzle/`. Both web and desktop apps apply migrations from this shared folder.

```
cd apps/web && bun x drizzle-kit generate
cd apps/web && bun x drizzle-kit push
```

### SQLite Rebuild

better-sqlite3 is a native module that must be compiled for the correct runtime:

- **Desktop**: `electron-rebuild` runs via postinstall in `apps/desktop/`
- **Web/tests**: `scripts/rebuild-sqlite.mjs` rebuilds for Node ABI (runs automatically with `dev:web`)

## Stack

- **Runtime**: Bun
- **Monorepo**: Turborepo
- **Web framework**: @tanstack/start (SSR with Vite + Nitro/node-server preset)
- **Desktop**: Electron Forge with Vite plugins (main, preload, renderer configs)
- **Routing**: TanStack Router (file-based, auto-generated `routeTree.gen.ts`)
- **Data fetching**: @tanstack/react-query (hooks in `packages/core/src/hooks/`)
- **Database**: SQLite via better-sqlite3 + Drizzle ORM
- **Auth**: better-auth with email/password + Google/GitHub OAuth
- **Spaced repetition**: ts-fsrs library
- **Styling**: Tailwind CSS v4 + shadcn/ui components (`apps/web/src/components/ui/`)
- **Linting**: Biome (config: `biome.json`)
- **Testing**: Vitest with in-memory SQLite (`apps/web/src/__tests__/test-utils.ts`)
- **Git hooks**: lefthook + commitlint (conventional commits, no scopes)

## Architecture

### Core Package (`packages/core`)

Shared logic consumed by both web and desktop. Granular exports via `package.json` exports field:

- `@swanki/core/db` — database factory (`createDb`) and schema
- `@swanki/core/services/*` — all service classes (DeckService, CardService, StudyService, etc.)
- `@swanki/core/hooks/*` — React Query hooks (use-study, use-decks, use-browse, etc.)
- `@swanki/core/lib/*` — utilities (template-renderer, sanitize, fsrs, search-parser)
- `@swanki/core/import/*` — import parsers (apkg, crowdanki, csv)
- `@swanki/core/transport` — `AppTransport` interface for platform abstraction
- `@swanki/core/platform` — platform context ("web" | "desktop")

### Platform Abstraction (Transport Layer)

Both apps share the same React components and hooks. Platform-specific I/O is abstracted through `AppTransport`:

- **Web**: `WebTransport` — fetch-based HTTP calls to API routes
- **Desktop**: `IpcTransport` — Electron IPC calls to main process

`TransportProvider` injects the correct transport. Hooks in core call `transport.query()`/`transport.mutate()` instead of `fetch()` directly.

### API Routes (Web)

Server API handlers live in `apps/web/src/routes/api/` as TanStack Router file routes with `server.handlers`. Each handler calls `requireSession(request)` for auth, instantiates a service from core, and returns `Response.json()`.

### Desktop IPC (Desktop)

`apps/desktop/electron/ipc-handlers.ts` routes IPC messages to core services:

- `db:query` — routes GET-like requests
- `db:mutate` — routes POST/PUT/PATCH/DELETE
- `auth:*`, `sync:*`, `window:*` — platform-specific handlers

### Service Layer

All business logic is in `packages/core/src/services/`. Services take a Drizzle `db` instance (type `BetterSQLite3Database<typeof schema>`) and contain synchronous methods — better-sqlite3 is synchronous, no async/await needed for DB operations.

### Authenticated Routes

`apps/web/src/routes/_authenticated.tsx` is a layout route that guards child routes via `beforeLoad` — redirects to `/login` if no session.

### Card Rendering

Templates use Anki-compatible mustache syntax (`{{FieldName}}`, `{{FrontSide}}`, `{{#Field}}...{{/Field}}`, `{{cloze:Field}}`). Rendering logic in `packages/core/src/lib/template-renderer.ts`, sanitized with DOMPurify.

### Database Schema

Defined in `packages/core/src/db/schema.ts`. Core tables: `decks`, `noteTypes`, `cardTemplates`, `notes`, `cards`, `reviewLogs`, `media`. Auth tables in `packages/core/src/db/auth-schema.ts`. All IDs are UUIDs via `crypto.randomUUID()`.

### Desktop Database

Local SQLite at `app.getPath("userData")/swanki.db`. Migrations loaded from `apps/web/drizzle/` (packaged as `extraResource`). Media served via custom protocol `swanki-media://media/`.

## Conventions

- `apps/web/src/routeTree.gen.ts` is auto-generated by TanStack Router — never edit manually
- Biome recommended rules are used across all workspaces; config at root `biome.json`
- Tests use in-memory SQLite with migrations applied via `createTestDb()` from `apps/web/src/__tests__/test-utils.ts`
- `@/*` path alias maps to `apps/web/src/*`
- Desktop uses `.cjs` extension for Forge's CJS output to coexist with `"type": "module"`
- `DATABASE_URL` env var defaults to `data/sqlite.db`

## License

AGPL-3.0 — all source files should comply with this license.
