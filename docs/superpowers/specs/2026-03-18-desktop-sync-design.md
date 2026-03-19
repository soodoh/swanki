# Desktop Sign-In & Bidirectional Sync

**Date**: 2026-03-18
**Status**: Draft

## Overview

Add account sign-in to the Swanki desktop app with full bidirectional sync to a configurable server. The desktop app currently supports pull-only sync; this design adds push, conflict resolution, media file transfer, deletion tracking, and a first-sign-in merge flow.

## Decisions

| Decision            | Choice                                                           |
| ------------------- | ---------------------------------------------------------------- |
| Conflict resolution | Last-write-wins (timestamp-based)                                |
| First sign-in       | Prompt user: merge local data or replace with cloud              |
| Server URL          | Settings UI with local persistence                               |
| Data scope          | All entities: decks, notes, cards, reviews, media                |
| Deletion tracking   | Tombstone table (hard deletes + tombstone records)               |
| ID strategy         | UUID text PKs for all syncable tables; content hash PK for media |
| Sync trigger        | Auto push (5s debounce) + periodic pull (5min) + manual          |
| Media transfer      | Metadata synced with data; files uploaded/downloaded separately  |
| Sync cycle order    | Push first, then pull                                            |
| Push processing     | LWW on server, FK-ordered inserts, single transaction            |

## 1. Schema Changes

### 1.1 UUID Primary Keys

All syncable tables switch from `INTEGER PRIMARY KEY AUTOINCREMENT` to `TEXT PRIMARY KEY` populated with `crypto.randomUUID()`. This eliminates sync ID mapping — the same UUID identifies the same entity on all clients and the server.

Affected tables: `decks`, `noteTypes`, `cardTemplates`, `notes`, `cards`, `reviewLogs`, `media`, `noteMedia`.

Foreign keys update accordingly (e.g., `cards.noteId` becomes `TEXT` referencing `notes.id`).

For notes, the existing `ankiGuid` field is promoted to serve as the primary key `id`, maintaining Anki import compatibility.

For media, the content hash (SHA-256 hex) serves as the primary key. This provides automatic deduplication — if two notes reference the same file, there is one row and one stored file.

This is a breaking migration. Existing databases will need UUIDs assigned to all rows.

### 1.2 Tombstone Table

```sql
CREATE TABLE deletions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tableName TEXT NOT NULL,
  entityId TEXT NOT NULL,
  userId TEXT NOT NULL,
  deletedAt INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Indexed on `(userId, deletedAt)` for efficient delta sync queries.

All delete operations across services write a tombstone row before hard-deleting the entity.

### 1.3 Settings Storage

The existing `sync-state.json` is extended:

```json
{
  "lastSyncTime": 1710000000,
  "lastPushTime": 1710000000,
  "cloudServerUrl": "http://localhost:3000"
}
```

`getCloudServerUrl()` reads from this config. Env var `SWANKI_CLOUD_URL` serves as a fallback override for development.

## 2. Push Endpoint

### 2.1 API

**`POST /api/sync/push`** (authenticated)

Request:

```typescript
interface SyncPushRequest {
  decks: Deck[];
  noteTypes: NoteType[];
  cardTemplates: CardTemplate[];
  notes: Note[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  media: MediaMetadata[]; // metadata only, no binary
  noteMedia: NoteMedia[];
  deletions: { tableName: string; entityId: string; deletedAt: number }[];
}
```

Response:

```typescript
interface SyncPushResponse {
  conflicts: {
    tableName: string;
    entityId: string;
    winner: "server" | "client";
  }[];
  mediaToUpload: string[]; // hashes the server doesn't have
  pushedAt: number; // timestamp for client to store as lastPushTime
}
```

### 2.2 Server-Side LWW Logic

For each incoming entity:

1. Look up existing row by ID + userId
2. No existing row → insert
3. Incoming `updatedAt >= existing.updatedAt` → update (client wins)
4. Incoming `updatedAt < existing.updatedAt` → skip (server wins)

Deletions: for each tombstone, delete the entity if it exists and its `updatedAt <= deletedAt`.

### 2.3 Processing Order

Foreign key integrity requires ordered processing:

1. `noteTypes` (no dependencies)
2. `cardTemplates` (depends on noteTypes)
3. `decks` (self-referencing parentId, no other dependencies)
4. `notes` (depends on noteTypes)
5. `cards` (depends on notes, decks, cardTemplates)
6. `reviewLogs` (depends on cards)
7. `media` (no dependencies)
8. `noteMedia` (depends on notes, media)
9. `deletions` (applied last, in reverse dependency order)

Entire push wrapped in a single SQLite transaction.

## 3. Pull Changes

### 3.1 Updated Pull Behavior

The existing `GET /api/sync/pull?since={timestamp}` endpoint now includes populated `deletions` from the tombstone table.

Client-side pull applies LWW instead of blind INSERT OR REPLACE:

1. For each incoming entity, compare `updatedAt` with local row
2. No local row → insert
3. Incoming `updatedAt >= local.updatedAt` → update (server wins)
4. Incoming `updatedAt < local.updatedAt` → skip (local wins, pushed next cycle)
5. For each server tombstone, delete locally if local `updatedAt <= deletedAt`

### 3.2 Sync Cycle Order

Push first, then pull. This ensures:

- Local changes reach the server before pulling back state
- Server-resolved conflicts come back in the pull response
- Reduces unnecessary conflict scenarios

## 4. Media File Transfer

### 4.1 Upload (Desktop to Server)

1. Push payload includes media metadata (hash, filename, mimeType, size)
2. Server responds with `mediaToUpload[]` — hashes it doesn't have
3. Client uploads each file to `POST /api/sync/media/upload` with hash and binary data
4. Uploads happen after data push, non-blocking

### 4.2 Download (Server to Desktop)

1. Pull response includes media metadata for new entries
2. Client checks which hashes are missing from local media directory
3. Downloads from `GET /api/sync/media/download?hash={hash}`
4. Saves to local media directory

### 4.3 Properties

- **Deduplication**: Hash-based PKs prevent re-transferring files either side already has
- **Independence**: Media transfer failures don't block data sync; retried next cycle
- **Background**: File transfers happen after the data sync completes

## 5. Change Tracking & Auto-Sync

### 5.1 Change Detection

No additional tracking mechanism needed. Entities with `updatedAt > lastPushTime` are candidates for push. Deletions tracked via the tombstone table.

### 5.2 Auto-Sync Triggers

- **Debounced push**: After any local mutation, start a 5-second debounce timer. Reset on subsequent mutations. Fire full sync cycle when timer expires.
- **Periodic sync**: Every 5 minutes as a safety net (existing behavior).
- **Manual sync**: "Sync Now" button triggers immediately.

### 5.3 Status Reporting

Extends the existing `onStatusChange` callback to surface sync state in the UI: idle, syncing, error, with last sync timestamp.

## 6. First Sign-In Flow

### 6.1 Flow

1. Auth window opens, user logs in, token extracted (existing flow)
2. Prompt dialog: _"You have local data. Would you like to merge it with your cloud account, or start fresh from the cloud?"_

**Merge path**:

1. Re-assign all local entities' `userId` from local user ID to cloud user ID
2. Push all local data to server (UUIDs are fresh, no conflicts)
3. Pull server's existing data (LWW merge, mostly inserts)
4. User has everything from both sides

**Replace path**:

1. Delete all local data (all tables)
2. Full pull from server
3. Clean slate matching cloud account

4. Set `lastSyncTime` and `lastPushTime` to server's `syncedAt`. Start auto-sync.

### 6.2 Local User Cleanup

After sign-in, the local user record is either re-mapped to the cloud user ID (merge) or deleted (replace). All subsequent operations use the cloud user ID.

## 7. Settings UI

### 7.1 Desktop Settings Page

New `/settings` route outside the `_authenticated` layout (must be accessible before sign-in). Contains:

- **Server URL**: Text input, validated as URL, defaults to `http://localhost:3000`
- **Account**: Shows signed-in email or "Not signed in", with Sign In / Sign Out button
- **Sync status**: Last synced timestamp, current status, manual "Sync Now" button

### 7.2 IPC Channels

- `settings:get` — returns current settings from `sync-state.json`
- `settings:update` — writes updated settings

### 7.3 Mobile (Future)

Same settings screen structure, stored via Capacitor Preferences. Not implemented in this iteration.

## 8. Files Changed

### New Files

- `apps/web/src/routes/api/sync/push.ts` — push endpoint
- `apps/web/src/routes/api/sync/media/upload.ts` — media upload endpoint
- `apps/web/src/routes/api/sync/media/download.ts` — media download endpoint
- `apps/web/src/routes/settings.tsx` — settings page (shared UI)
- `packages/core/src/db/schema.ts` — tombstone table, UUID PK migration

### Modified Files

- `packages/core/src/services/sync-service.ts` — add `push()`, populate deletions in pull
- `apps/desktop/electron/sync.ts` — add push logic, LWW on pull, debounced auto-sync, media transfer
- `apps/desktop/electron/auth.ts` — read server URL from settings instead of env var
- `apps/desktop/electron/ipc-handlers.ts` — add `settings:*` IPC channels, update sync handlers
- `apps/desktop/src/preload.ts` — expose settings IPC channels
- All service files with delete operations — write tombstone before deleting
- All Drizzle migration files — UUID PK migration, tombstone table creation
