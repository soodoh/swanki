# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Swanki is a Turborepo monorepo with three apps:

- **web** (`apps/web`) — @tanstack/start + React + Tailwind CSS, runs on Bun
- **docs** (`apps/docs`) — placeholder
- **mobile** (`apps/mobile`) — placeholder

## Build & Dev Commands

- `bun run dev:web` — start web dev server (port 3000)
- `bun run build` — build all apps
- `bun run lint` — oxlint + prettier check
- `bun run lint:fix` — auto-fix lint issues

## Stack

- **Runtime**: Bun 1.3.10
- **Monorepo**: Turborepo
- **Web framework**: @tanstack/start (SSR with Nitro/Bun preset)
- **Styling**: Tailwind CSS v4
- **Linting**: oxlint + prettier
- **Git hooks**: husky + lint-staged + commitlint (conventional commits, no scopes)

## License

AGPL-3.0 — all source files should comply with this license.
