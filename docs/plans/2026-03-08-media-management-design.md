# Media Management Design

## Date: 2026-03-08

## Problem

APKG imports extract media files (images, audio, video) into memory but discard them. Media references in note fields (`<img src="image.jpg">`) point to nonexistent files. The browse/edit UI has no way to view, upload, or delete media attachments. No mechanism exists to prevent orphaned media files.

## Decisions

- **URL rewriting at import time** — Rewrite Anki's bare filenames to `/api/media/{hash}.ext` during import. Simpler rendering, still Anki-compatible on re-export.
- **Reference counting via join table** — Real-time tracking of note-to-media references. Orphans deleted immediately when last reference is removed.
- **Split view editor** — Text input for raw field content + attachment strip below showing previews with delete/upload controls. Auto-syncs text and attachments.
- **Per-user media** — Each user owns their media independently. No cross-user sharing.
- **Service-layer integration** — MediaService handles all media logic; ImportService delegates to it.

## Data Model

### New table: `noteMedia`

```sql
noteMedia (
  id          TEXT PRIMARY KEY,     -- UUID
  noteId      TEXT NOT NULL,        -- FK -> notes.id
  mediaId     TEXT NOT NULL,        -- FK -> media.id
  UNIQUE(noteId, mediaId)
)
```

Indexes on `noteId` and `mediaId`.

### Existing `media` table — no changes

Already has: `id`, `userId`, `filename` (hash.ext), `hash` (SHA-256 dedup key), `mimeType`, `size`, `createdAt`.

### Field value format

After import: `<img src="paste-123.jpg">` becomes `<img src="/api/media/a1b2c3d4.jpg">`.

## Import Pipeline

1. **`apkg-parser.ts`** — Already extracts `ApkgMediaEntry[]`. No changes.
2. **`MediaService.importBatch(userId, entries)`** — New method. Hashes each file, dedup check, writes to disk, inserts media records. Returns `Map<string, string>` (old filename -> new URL).
3. **`ImportService.importFromApkg()`** — Uses filename mapping to rewrite all note field values before insertion. Handles `src="filename"` and `[sound:filename]` patterns.
4. **`noteMedia` population** — After note insertion, parse fields for `/api/media/` references, insert join table rows.

### CrowdAnki / CSV / TXT

Out of scope for initial implementation. CrowdAnki would need zip support for media files. CSV/TXT are text-only.

## Reference Counting & Orphan Cleanup

### Triggers

1. **Note field edit** — Parse new fields, diff against existing `noteMedia` rows. Insert new refs, remove stale ones. Delete orphaned media (record + file).
2. **Note deletion** — Remove all `noteMedia` rows. Delete any media with zero remaining references.
3. **Deck deletion** — Cascades through note deletion logic.

### Implementation

`MediaService.reconcileNoteReferences(noteId, currentMediaFilenames[])` handles the diff. Called by NoteService on update (with new filenames) and delete (with empty array).

Shared media across notes (same hash) handled naturally — file deleted only when last reference removed.

## Browse/Edit UI

### Field editor layout

```
+----------------------------------+
| Field Name                       |
+----------------------------------+
| [text input - raw field value]   |
+----------------------------------+
| Attachments:                     |
| [thumb X] [thumb X]   [+ Upload] |
+----------------------------------+
```

- **Text input** — Plain text, shows raw HTML. Manually editable.
- **Attachment strip** — Thumbnail previews (images), playback icons (audio/video). Delete (X) button on each.
- **Upload button** — File picker. Calls `/api/media/upload`, auto-inserts tag into field text.
- **Delete button** — Removes tag from field text, triggers reference cleanup.
- **Attachments parsed client-side** — Extract `/api/media/` URLs from field text. No extra API call needed.

## API Surface

### No new routes

- `POST /api/media/upload` — Existing. Used by editor upload.
- `GET /api/media/$filename` — Existing. Serves files.
- `POST /api/import` — Modified to persist media during APKG import.
- `PUT /api/notes/$noteId` — Modified to call `reconcileNoteReferences()`.
- `DELETE /api/notes/$noteId` — Modified to clean up references.

### New service methods

- `MediaService.importBatch(userId, entries[])` -> filename mapping
- `MediaService.reconcileNoteReferences(noteId, filenames[])` -> orphan cleanup
- `MediaService.getMediaForNote(noteId)` -> media records (server-side use)

### New React Query hook

- None needed — attachment strip parses field values client-side.
