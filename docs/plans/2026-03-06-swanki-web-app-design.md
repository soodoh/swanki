# Swanki Web App Design

## Overview

Swanki is a modern web-based spaced repetition flashcard app with feature parity to Anki desktop/web. It uses FSRS scheduling, supports importing existing Anki collections, and is designed for multi-user deployment.

## Stack

- **Framework:** TanStack Start (SSR with Nitro/Bun preset)
- **UI:** React 19, shadcn/ui, Tailwind CSS v4
- **Database:** bun:sqlite + Drizzle ORM
- **Client state:** TanStack Query
- **Auth:** better-auth (email/password + Google & GitHub OAuth)
- **Scheduling:** ts-fsrs (FSRS algorithm)
- **Testing:** Vitest (unit tests)
- **Runtime:** Bun

## Architecture

### API Layer

All data access goes through API routes (`/api/*`) returning JSON. The web client consumes them via TanStack Query. This design allows a future mobile app to share the same endpoints.

Server function RPCs are not used — API routes provide a universal interface.

### API Route Groups

- **Auth** — better-auth built-in routes (`/api/auth/*`)
- **Decks** — CRUD, reorder, tree structure, study counts
- **Notes** — CRUD, search, bulk operations
- **Note Types** — CRUD, field management, template management
- **Cards** — due cards for study, browse/search
- **Study** — get next card, submit review (FSRS scheduling), undo
- **Stats** — daily reviews, forecast, card maturity, retention, heatmap, streaks
- **Import** — upload and process .colpkg, .apkg, .txt, .csv, CrowdAnki JSON
- **Media** — upload, static file serving from media directory

### Media Storage

Media files (images, audio, video) stored on local filesystem. Files are SHA-256 hashed for deduplication. Served statically.

## Data Model

### Users

Managed by better-auth (its own tables for users, sessions, accounts).

### Decks

- `id`, `userId`, `name`, `parentId` (nullable, for nesting), `description`, `settings` (JSON: new cards/day, max reviews, etc.), `createdAt`, `updatedAt`

### Note Types

- `id`, `userId`, `name`, `fields` (JSON array of field definitions), `css` (custom styling), `createdAt`, `updatedAt`

### Card Templates

Belong to a note type.

- `id`, `noteTypeId`, `name`, `ordinal`, `questionTemplate` (HTML with `{{field}}` syntax), `answerTemplate`

### Notes

- `id`, `userId`, `noteTypeId`, `fields` (JSON object mapping field names to values), `tags` (text, space-delimited), `createdAt`, `updatedAt`

### Cards

Generated from notes x templates.

- `id`, `noteId`, `deckId`, `templateId`, `ordinal`, `due`, `stability`, `difficulty`, `elapsedDays`, `scheduledDays`, `reps`, `lapses`, `state` (new/learning/review/relearning), `lastReview`, `createdAt`, `updatedAt`

### Review Log

Every review recorded for stats and FSRS optimization.

- `id`, `cardId`, `rating` (again/hard/good/easy), `state` (state before review), `due` (due date before review), `stability`, `difficulty`, `elapsedDays`, `lastElapsedDays`, `scheduledDays`, `reviewedAt`, `timeTakenMs`

### Media

- `id`, `userId`, `filename`, `hash` (SHA-256), `mimeType`, `size`, `createdAt`

## Pages & UI

### Unauthenticated

- `/login` — email/password + Google/GitHub OAuth
- `/register` — sign up
- `/forgot-password` — password reset

### Authenticated (app shell with sidebar)

- `/` — Dashboard: deck tree, due counts, heatmap, streak
- `/study/:deckId` — Study session: card front/back, rating buttons, progress
- `/browse` — Card browser: search bar (Anki syntax), filter sidebar, card table, detail/edit panel
- `/decks/:deckId` — Deck detail: settings, stats, sub-decks
- `/decks/new` — Create deck
- `/note-types` — Manage note types: list, create, edit fields/templates/CSS
- `/import` — Import wizard: upload, configure, preview, import
- `/stats` — Statistics: reviews/day, forecast, card states, retention, time, heatmap
- `/settings` — User settings: study preferences, account management

## Study Session

### Flow

1. User clicks "Study" on a deck
2. API returns due cards: overdue reviews first, then learning, then new (up to daily limit)
3. Counts displayed: New (blue) / Learning (orange) / Review (green)
4. Show question side (rendered HTML template with field substitution)
5. User reveals answer (Space/Enter)
6. Rating buttons: Again / Hard / Good / Easy (each shows next interval preview)
7. FSRS computes new scheduling, card updated, review log created
8. Next card loads; session ends with congratulations screen

### Keyboard Shortcuts

- Space/Enter: show answer
- 1/2/3/4: Again/Hard/Good/Easy
- Z: undo

### Undo

Single-level undo (last review only). Restores previous card state and deletes review log entry.

### Custom Study

Available at session end: study ahead, increase limit, review by tag.

### Preview Mode

Browse cards without affecting scheduling.

## Note Types & Templates

Anki-compatible HTML/CSS template system:

- Field substitution: `{{FieldName}}`
- Cloze deletions: `{{cloze:Text}}`
- Conditional sections: `{{#FieldName}}...{{/FieldName}}`
- Custom CSS per note type
- Multiple card templates per note type (e.g., forward and reverse cards)

## Card Browser

Dual search interface:

- **Filter UI** — Dropdowns for deck, tag, state (new/learning/review/suspended)
- **Search bar** — Anki-compatible syntax (e.g., `deck:Japanese tag:verb is:due`)

Both can be used together. Search syntax is parsed and translated to SQL queries.

## Import System

### Supported Formats

- `.apkg` — Anki deck package (ZIP containing SQLite DB + media)
- `.colpkg` — Anki collection package (full collection export)
- `.csv` — CSV with configurable field mapping
- `.txt` — Plain text with configurable delimiter
- **CrowdAnki** — JSON directory format (e.g., `anki-geo/ultimate-geography`)

### Import Wizard

1. **Upload** — Drag-and-drop or file picker, auto-detect format
2. **Configure** — Format-specific options (deck selection, field mapping for CSV/txt, merge vs. create new)
3. **Preview** — Sample cards, flag issues (missing media, duplicates)
4. **Import** — Background processing with progress indicator

### Duplicate Handling

Match by first field content (like Anki). Options: skip, update existing, or import as new.

### Media Extraction

For .apkg/.colpkg: extract from ZIP, SHA-256 hash for dedup, store in media directory.

## Statistics

Enhanced beyond Anki's default stats:

- Cards reviewed per day (bar chart)
- Time spent studying
- Card state distribution (new/learning/review)
- Review forecast (upcoming due cards)
- FSRS retention predictions per card
- Review heatmap (GitHub-style calendar)
- Study streaks

## Authentication

- better-auth with email/password + Google and GitHub OAuth
- Multi-user: each user owns their own decks, cards, and stats
- Session-based auth

## Testing Strategy

Vitest unit tests focused on:

- **FSRS scheduling** — interval calculations, state transitions
- **Import parsers** — each format with fixture files
- **Search syntax parser** — query parsing and SQL generation
- **Template rendering** — field substitution, cloze, conditionals
- **API route handlers** — request/response correctness, auth guards

## Out of Scope (for now)

- Filtered decks
- AnkiWeb sync/login import
- Mobile app
- E2E tests (Playwright)
- Deck sharing between users
