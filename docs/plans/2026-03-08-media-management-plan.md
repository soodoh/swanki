# Media Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist media files from APKG imports, rewrite note field URLs, track note-media references, clean up orphans on edit/delete, and add an attachment strip to the browse editor.

**Architecture:** Extend MediaService with batch import and reference reconciliation methods. Add a `noteMedia` join table for reference counting. ImportService delegates media persistence to MediaService and rewrites field values before inserting notes. The browse UI parses field values client-side to render an attachment strip with delete/upload controls.

**Tech Stack:** Drizzle ORM (SQLite), bun:sqlite, React, TanStack Query, Tailwind CSS, shadcn/ui components

---

### Task 1: Add `noteMedia` Join Table to Schema

**Files:**

- Modify: `apps/web/src/db/schema.ts` (after line 169)

**Step 1: Add the noteMedia table definition**

Add after the `media` table in `schema.ts`:

```typescript
export const noteMedia = sqliteTable(
  "note_media",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id").notNull(),
    mediaId: text("media_id").notNull(),
  },
  (table) => [
    index("note_media_note_id_idx").on(table.noteId),
    index("note_media_media_id_idx").on(table.mediaId),
    uniqueIndex("note_media_note_media_unique").on(table.noteId, table.mediaId),
  ],
);
```

Note: import `uniqueIndex` from `drizzle-orm/sqlite-core`.

**Step 2: Generate the migration**

Run: `cd apps/web && bun x drizzle-kit generate`
Expected: New migration file in `apps/web/drizzle/`

**Step 3: Push the migration**

Run: `cd apps/web && bun x drizzle-kit push`
Expected: Success, `note_media` table created

**Step 4: Commit**

```
git add apps/web/src/db/schema.ts apps/web/drizzle/
git commit -m "feat: add noteMedia join table for media reference tracking"
```

---

### Task 2: Add `importBatch` Method to MediaService

**Files:**

- Test: `apps/web/src/__tests__/lib/services/media-service.test.ts` (create)
- Modify: `apps/web/src/lib/services/media-service.ts`

**Step 1: Write the failing test**

Create `apps/web/src/__tests__/lib/services/media-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../test-utils";
import { MediaService } from "@/lib/services/media-service";
import { media } from "@/db/schema";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "@/db/schema";

type Db = BunSQLiteDatabase<typeof schema>;

const TEST_MEDIA_DIR = join(process.cwd(), "data", "media");

describe("MediaService.importBatch", () => {
  let db: Db;
  let service: MediaService;

  beforeEach(() => {
    db = createTestDb();
    service = new MediaService(db);
  });

  afterEach(() => {
    if (existsSync(TEST_MEDIA_DIR)) {
      rmSync(TEST_MEDIA_DIR, { recursive: true, force: true });
    }
  });

  it("should save media files and return filename mapping", async () => {
    const entries = [
      {
        filename: "image.jpg",
        index: "0",
        data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      },
      {
        filename: "sound.mp3",
        index: "1",
        data: new Uint8Array([0x49, 0x44, 0x33]),
      },
    ];

    const mapping = await service.importBatch("user-1", entries);

    expect(mapping.size).toBe(2);
    expect(mapping.get("image.jpg")).toMatch(/^\/api\/media\/[a-f0-9]+\.jpg$/);
    expect(mapping.get("sound.mp3")).toMatch(/^\/api\/media\/[a-f0-9]+\.mp3$/);

    const records = db.select().from(media).all();
    expect(records).toHaveLength(2);
  });

  it("should deduplicate identical files", async () => {
    const sameData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const entries = [
      { filename: "copy1.png", index: "0", data: sameData },
      { filename: "copy2.png", index: "1", data: sameData },
    ];

    const mapping = await service.importBatch("user-1", entries);

    expect(mapping.get("copy1.png")).toBe(mapping.get("copy2.png"));

    const records = db.select().from(media).all();
    expect(records).toHaveLength(1);
  });

  it("should skip entries with no data", async () => {
    const entries = [
      { filename: "missing.jpg", index: "0", data: new Uint8Array(0) },
    ];

    const mapping = await service.importBatch("user-1", entries);
    expect(mapping.size).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/media-service.test.ts`
Expected: FAIL -- `importBatch` method does not exist

**Step 3: Implement `importBatch` in MediaService**

Add to `media-service.ts`, inside the `MediaService` class, after the `upload` method.

```typescript
async importBatch(
  userId: string,
  entries: Array<{ filename: string; index: string; data: Uint8Array }>,
): Promise<Map<string, string>> {
  ensureMediaDir();

  const mapping = new Map<string, string>();

  for (const entry of entries) {
    if (entry.data.length === 0) {
      continue;
    }

    const hashBuffer = await crypto.subtle.digest("SHA-256", entry.data);
    const hashArray = [...new Uint8Array(hashBuffer)];
    const hash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const existing = this.db
      .select()
      .from(media)
      .where(eq(media.hash, hash))
      .get();

    if (existing) {
      mapping.set(entry.filename, `/api/media/${existing.filename}`);
      continue;
    }

    const ext = entry.filename.includes(".")
      ? `.${entry.filename.split(".").pop()}`
      : "";
    const filename = `${hash}${ext}`;
    const mimeType = guessMimeType(entry.filename);

    const filePath: string = join(MEDIA_DIR, filename);
    await Bun.write(filePath, entry.data);

    this.db
      .insert(media)
      .values({
        id: generateId(),
        userId,
        filename,
        hash,
        mimeType,
        size: entry.data.length,
        createdAt: new Date(),
      })
      .run();

    mapping.set(entry.filename, `/api/media/${filename}`);
  }

  return mapping;
}
```

Also add this helper function outside the class (before the class definition):

```typescript
function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    mp4: "video/mp4",
    webm: "video/webm",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/media-service.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add apps/web/src/lib/services/media-service.ts apps/web/src/__tests__/lib/services/media-service.test.ts
git commit -m "feat: add importBatch method to MediaService for APKG media persistence"
```

---

### Task 3: Add Field URL Rewriting to ImportService

**Files:**

- Test: `apps/web/src/__tests__/lib/services/import-service.test.ts` (create or extend)
- Modify: `apps/web/src/lib/services/import-service.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { rewriteMediaUrls } from "@/lib/services/import-service";

describe("rewriteMediaUrls", () => {
  const mapping = new Map<string, string>([
    ["image.jpg", "/api/media/abc123.jpg"],
    ["sound.mp3", "/api/media/def456.mp3"],
  ]);

  it("should rewrite img src attributes", () => {
    const input = '<img src="image.jpg">';
    expect(rewriteMediaUrls(input, mapping)).toBe(
      '<img src="/api/media/abc123.jpg">',
    );
  });

  it("should rewrite Anki sound syntax", () => {
    const input = "[sound:sound.mp3]";
    expect(rewriteMediaUrls(input, mapping)).toBe(
      "[sound:/api/media/def456.mp3]",
    );
  });

  it("should handle multiple media references in one field", () => {
    const input = '<img src="image.jpg"> and [sound:sound.mp3]';
    const expected =
      '<img src="/api/media/abc123.jpg"> and [sound:/api/media/def456.mp3]';
    expect(rewriteMediaUrls(input, mapping)).toBe(expected);
  });

  it("should leave non-media text unchanged", () => {
    const input = "Plain text with no media";
    expect(rewriteMediaUrls(input, mapping)).toBe(input);
  });

  it("should leave unrecognized filenames unchanged", () => {
    const input = '<img src="unknown.jpg">';
    expect(rewriteMediaUrls(input, mapping)).toBe(input);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/import-service.test.ts`
Expected: FAIL -- `rewriteMediaUrls` not exported

**Step 3: Implement `rewriteMediaUrls` and integrate into import**

Add to `import-service.ts` as an exported function (before the class):

```typescript
export function rewriteMediaUrls(
  text: string,
  mapping: Map<string, string>,
): string {
  let result = text;

  // Rewrite src="filename" (handles img, audio, video source tags)
  result = result.replace(/src="([^"]+)"/g, (match, filename: string) => {
    const newUrl = mapping.get(filename);
    return newUrl ? `src="${newUrl}"` : match;
  });

  // Rewrite [sound:filename] (Anki audio syntax)
  result = result.replace(/\[sound:([^\]]+)\]/g, (match, filename: string) => {
    const newUrl = mapping.get(filename);
    return newUrl ? `[sound:${newUrl}]` : match;
  });

  return result;
}
```

Then modify `importFromApkg()` signature to accept a media mapping:

```typescript
importFromApkg(
  userId: string,
  data: ApkgData,
  mediaMapping?: Map<string, string>,
): ImportResult {
```

In the note field mapping loop (around line 436), after building `noteFields`, add rewriting:

```typescript
// Rewrite media URLs if mapping is provided
if (mediaMapping) {
  for (const fieldName of Object.keys(noteFields)) {
    noteFields[fieldName] = rewriteMediaUrls(
      noteFields[fieldName],
      mediaMapping,
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/import-service.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add apps/web/src/lib/services/import-service.ts apps/web/src/__tests__/lib/services/import-service.test.ts
git commit -m "feat: add media URL rewriting for APKG import field values"
```

---

### Task 4: Wire Up Media Persistence in Import API Route

**Files:**

- Modify: `apps/web/src/routes/api/import.ts`

**Step 1: Update the import route to persist media**

In the APKG import branch of `import.ts`, after parsing the APKG and before calling `importFromApkg`, add media persistence:

```typescript
const mediaService = new MediaService(db);
const mediaMapping = await mediaService.importBatch(
  session.user.id,
  apkgData.media,
);
const result = importService.importFromApkg(
  session.user.id,
  apkgData,
  mediaMapping,
);
```

Add the `MediaService` import at the top of the file:

```typescript
import { MediaService } from "@/lib/services/media-service";
```

**Step 2: Run lint to verify no errors**

Run: `cd apps/web && bun run lint`
Expected: No errors

**Step 3: Commit**

```
git add apps/web/src/routes/api/import.ts
git commit -m "feat: persist APKG media files during import"
```

---

### Task 5: Add `noteMedia` Population During Import

**Files:**

- Test: `apps/web/src/__tests__/lib/services/import-service.test.ts` (extend)
- Modify: `apps/web/src/lib/services/import-service.ts`

**Step 1: Write the failing test**

Add to the import service test file:

```typescript
import { createTestDb } from "../test-utils";
import { ImportService } from "@/lib/services/import-service";
import { noteMedia, notes, media } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("importFromApkg noteMedia population", () => {
  it("should create noteMedia records for notes with media references", () => {
    const db = createTestDb();
    const service = new ImportService(db);

    // Insert a mock media record
    db.insert(media)
      .values({
        id: "media-1",
        userId: "user-1",
        filename: "abc123.jpg",
        hash: "abc123",
        mimeType: "image/jpeg",
        size: 100,
        createdAt: new Date(),
      })
      .run();

    const apkgData = {
      decks: [{ id: 1, name: "Test Deck" }],
      noteTypes: [
        {
          id: 1,
          name: "Basic",
          fields: [
            { name: "Front", ordinal: 0 },
            { name: "Back", ordinal: 1 },
          ],
          templates: [
            {
              name: "Card 1",
              ordinal: 0,
              questionFormat: "{{Front}}",
              answerFormat: "{{Back}}",
            },
          ],
          css: "",
        },
      ],
      notes: [
        {
          id: 1,
          modelId: 1,
          fields: ['<img src="image.jpg">', "Back text"],
          tags: "",
        },
      ],
      cards: [
        {
          id: 1,
          noteId: 1,
          deckId: 1,
          ordinal: 0,
          type: 0,
          queue: 0,
          due: 0,
          reps: 0,
          lapses: 0,
        },
      ],
      media: [],
    };

    const mediaMapping = new Map([["image.jpg", "/api/media/abc123.jpg"]]);
    service.importFromApkg("user-1", apkgData, mediaMapping);

    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(1);

    const refs = db
      .select()
      .from(noteMedia)
      .where(eq(noteMedia.noteId, allNotes[0].id))
      .all();
    expect(refs).toHaveLength(1);
    expect(refs[0].mediaId).toBe("media-1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/import-service.test.ts`
Expected: FAIL -- noteMedia not populated

**Step 3: Implement noteMedia population**

Add the helper function (exported, before the class):

```typescript
export function extractMediaFilenames(
  fields: Record<string, string>,
): string[] {
  const filenames: string[] = [];
  const allText = Object.values(fields).join(" ");

  const srcRegex = /\/api\/media\/([^\s"'<>\]]+)/g;
  let match;
  while ((match = srcRegex.exec(allText)) !== null) {
    filenames.push(match[1]);
  }

  return [...new Set(filenames)];
}
```

Add necessary imports to `import-service.ts`:

```typescript
import { noteMedia, media } from "../../db/schema";
```

In `importFromApkg()`, after inserting the note (around line 452), add:

```typescript
// Track media references
if (mediaMapping) {
  const mediaFilenames = extractMediaFilenames(noteFields);
  for (const filename of mediaFilenames) {
    const mediaRecord = this.db
      .select()
      .from(media)
      .where(eq(media.filename, filename))
      .get();
    if (mediaRecord) {
      this.db
        .insert(noteMedia)
        .values({
          id: generateId(),
          noteId,
          mediaId: mediaRecord.id,
        })
        .onConflictDoNothing()
        .run();
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/import-service.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add apps/web/src/lib/services/import-service.ts apps/web/src/__tests__/lib/services/import-service.test.ts
git commit -m "feat: populate noteMedia join table during APKG import"
```

---

### Task 6: Add `reconcileNoteReferences` to MediaService

**Files:**

- Test: `apps/web/src/__tests__/lib/services/media-service.test.ts` (extend)
- Modify: `apps/web/src/lib/services/media-service.ts`

**Step 1: Write the failing test**

Add to the media service test file:

```typescript
import { noteMedia } from "@/db/schema";

describe("MediaService.reconcileNoteReferences", () => {
  let db: Db;
  let service: MediaService;

  beforeEach(() => {
    db = createTestDb();
    service = new MediaService(db);
  });

  afterEach(() => {
    if (existsSync(TEST_MEDIA_DIR)) {
      rmSync(TEST_MEDIA_DIR, { recursive: true, force: true });
    }
  });

  it("should remove references and delete orphaned media", async () => {
    const entries = [
      {
        filename: "test.jpg",
        index: "0",
        data: new Uint8Array([1, 2, 3, 4]),
      },
    ];
    const mapping = await service.importBatch("user-1", entries);
    const url = mapping.get("test.jpg")!;
    const filename = url.replace("/api/media/", "");

    const mediaRecord = db.select().from(media).all()[0];
    db.insert(noteMedia)
      .values({ id: "ref-1", noteId: "note-1", mediaId: mediaRecord.id })
      .run();

    // Reconcile with empty array (simulating delete)
    service.reconcileNoteReferences("note-1", []);

    const refs = db.select().from(noteMedia).all();
    expect(refs).toHaveLength(0);

    const records = db.select().from(media).all();
    expect(records).toHaveLength(0);

    const filePath = join(TEST_MEDIA_DIR, filename);
    expect(existsSync(filePath)).toBe(false);
  });

  it("should not delete media still referenced by other notes", async () => {
    const entries = [
      {
        filename: "shared.png",
        index: "0",
        data: new Uint8Array([5, 6, 7]),
      },
    ];
    await service.importBatch("user-1", entries);
    const mediaRecord = db.select().from(media).all()[0];

    db.insert(noteMedia)
      .values({ id: "ref-1", noteId: "note-1", mediaId: mediaRecord.id })
      .run();
    db.insert(noteMedia)
      .values({ id: "ref-2", noteId: "note-2", mediaId: mediaRecord.id })
      .run();

    service.reconcileNoteReferences("note-1", []);

    const records = db.select().from(media).all();
    expect(records).toHaveLength(1);

    const refs = db.select().from(noteMedia).all();
    expect(refs).toHaveLength(1);
    expect(refs[0].noteId).toBe("note-2");
  });

  it("should add new references for newly added media", async () => {
    const entries = [
      {
        filename: "new.jpg",
        index: "0",
        data: new Uint8Array([8, 9, 10]),
      },
    ];
    await service.importBatch("user-1", entries);
    const mediaRecord = db.select().from(media).all()[0];

    service.reconcileNoteReferences("note-1", [mediaRecord.filename]);

    const refs = db.select().from(noteMedia).all();
    expect(refs).toHaveLength(1);
    expect(refs[0].noteId).toBe("note-1");
    expect(refs[0].mediaId).toBe(mediaRecord.id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/media-service.test.ts`
Expected: FAIL -- `reconcileNoteReferences` not defined

**Step 3: Implement `reconcileNoteReferences`**

Add to `MediaService` class. Add imports for `noteMedia` from the schema, `and` from `drizzle-orm`, and `unlinkSync` from `node:fs`:

```typescript
reconcileNoteReferences(noteId: string, currentFilenames: string[]): void {
  const existingRefs = this.db
    .select()
    .from(noteMedia)
    .where(eq(noteMedia.noteId, noteId))
    .all();

  const existingMediaIds = new Set(existingRefs.map((r) => r.mediaId));

  const currentMediaIds = new Set<string>();
  for (const filename of currentFilenames) {
    const record = this.db
      .select()
      .from(media)
      .where(eq(media.filename, filename))
      .get();
    if (record) {
      currentMediaIds.add(record.id);
    }
  }

  // Add new references
  for (const mediaId of currentMediaIds) {
    if (!existingMediaIds.has(mediaId)) {
      this.db
        .insert(noteMedia)
        .values({ id: generateId(), noteId, mediaId })
        .onConflictDoNothing()
        .run();
    }
  }

  // Remove stale references and clean up orphans
  for (const ref of existingRefs) {
    if (!currentMediaIds.has(ref.mediaId)) {
      this.db
        .delete(noteMedia)
        .where(
          and(
            eq(noteMedia.noteId, noteId),
            eq(noteMedia.mediaId, ref.mediaId),
          ),
        )
        .run();

      // Check if media is now orphaned
      const remaining = this.db
        .select()
        .from(noteMedia)
        .where(eq(noteMedia.mediaId, ref.mediaId))
        .all();

      if (remaining.length === 0) {
        const mediaRecord = this.db
          .select()
          .from(media)
          .where(eq(media.id, ref.mediaId))
          .get();

        if (mediaRecord) {
          const filePath: string = join(MEDIA_DIR, mediaRecord.filename);
          try {
            unlinkSync(filePath);
          } catch {
            // File may already be gone
          }
          this.db.delete(media).where(eq(media.id, ref.mediaId)).run();
        }
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && bun --bun vitest run src/__tests__/lib/services/media-service.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add apps/web/src/lib/services/media-service.ts apps/web/src/__tests__/lib/services/media-service.test.ts
git commit -m "feat: add reconcileNoteReferences for orphan media cleanup"
```

---

### Task 7: Integrate Reference Reconciliation into Note Update/Delete

**Files:**

- Modify: `apps/web/src/routes/api/notes/$noteId.ts`

**Step 1: Update the PUT handler to reconcile media references**

After calling `noteService.update()`, add:

```typescript
if (body.fields) {
  const mediaService = new MediaService(db);
  const filenames = extractMediaFilenames(body.fields);
  mediaService.reconcileNoteReferences(params.noteId, filenames);
}
```

Add imports:

```typescript
import { MediaService } from "@/lib/services/media-service";
import { extractMediaFilenames } from "@/lib/services/import-service";
```

**Step 2: Update the DELETE handler to clean up media**

Before calling `noteService.delete()`, add:

```typescript
const mediaService = new MediaService(db);
mediaService.reconcileNoteReferences(params.noteId, []);
```

**Step 3: Run lint**

Run: `cd apps/web && bun run lint`
Expected: No errors

**Step 4: Commit**

```
git add apps/web/src/routes/api/notes/$noteId.ts
git commit -m "feat: reconcile media references on note update and delete"
```

---

### Task 8: Add Attachment Strip Component

**Files:**

- Create: `apps/web/src/components/browse/field-attachments.tsx`

**Step 1: Build the attachment strip component**

This component parses a field value for `/api/media/` URLs and renders thumbnails with delete buttons and an upload button.

Create `apps/web/src/components/browse/field-attachments.tsx`:

```typescript
import { useState, useRef } from "react";
import { X, Upload, Volume2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";

type FieldAttachmentsProps = {
  fieldValue: string;
  onFieldChange: (newValue: string) => void;
};

type MediaRef = {
  url: string;
  filename: string;
  type: "image" | "audio" | "video";
};

function parseMediaRefs(text: string): MediaRef[] {
  const refs: MediaRef[] = [];
  const seen = new Set<string>();

  const srcRegex = /\/api\/media\/([^\s"'<>\]]+)/g;
  let match;
  while ((match = srcRegex.exec(text)) !== null) {
    const filename = match[1];
    if (seen.has(filename)) continue;
    seen.add(filename);

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    let type: "image" | "audio" | "video" = "image";
    if (["mp3", "wav", "ogg", "m4a"].includes(ext)) type = "audio";
    if (["mp4", "webm", "mov"].includes(ext)) type = "video";

    refs.push({ url: `/api/media/${filename}`, filename, type });
  }

  return refs;
}

export function FieldAttachments({
  fieldValue,
  onFieldChange,
}: FieldAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const mediaRefs = parseMediaRefs(fieldValue);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as {
        url: string;
        mimeType: string;
      };

      let tag: string;
      if (data.mimeType.startsWith("image/")) {
        tag = `<img src="${data.url}">`;
      } else if (data.mimeType.startsWith("audio/")) {
        tag = `[sound:${data.url}]`;
      } else {
        tag = `<video src="${data.url}" controls></video>`;
      }

      onFieldChange(fieldValue ? `${fieldValue} ${tag}` : tag);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDelete(ref: MediaRef) {
    let newValue = fieldValue;
    const escaped = ref.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Remove <img> tags
    newValue = newValue.replace(
      new RegExp(`<img[^>]*src="${escaped}"[^>]*>`, "g"),
      "",
    );
    // Remove [sound:] tags
    newValue = newValue.replace(
      new RegExp(`\\[sound:${escaped}\\]`, "g"),
      "",
    );
    // Remove <video> tags
    newValue = newValue.replace(
      new RegExp(
        `<video[^>]*src="${escaped}"[^>]*>[^<]*</video>`,
        "g",
      ),
      "",
    );
    newValue = newValue.replace(/\s+/g, " ").trim();
    onFieldChange(newValue);
  }

  if (mediaRefs.length === 0 && !uploading) {
    return (
      <div className="flex items-center gap-1 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-3" data-icon="inline-start" />
          Attach file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,video/*"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {mediaRefs.map((ref) => (
        <div
          key={ref.filename}
          className="group relative rounded border border-border bg-muted/50"
        >
          {ref.type === "image" && (
            <img
              src={ref.url}
              alt=""
              className="size-12 rounded object-cover"
            />
          )}
          {ref.type === "audio" && (
            <div className="flex size-12 items-center justify-center">
              <Volume2 className="size-5 text-muted-foreground" />
            </div>
          )}
          {ref.type === "video" && (
            <div className="flex size-12 items-center justify-center">
              <Film className="size-5 text-muted-foreground" />
            </div>
          )}
          <button
            type="button"
            onClick={() => handleDelete(ref)}
            className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="size-3.5" />
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,audio/*,video/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
```

**Step 2: Run lint**

Run: `cd apps/web && bun run lint`
Expected: No errors

**Step 3: Commit**

```
git add apps/web/src/components/browse/field-attachments.tsx
git commit -m "feat: add FieldAttachments component for media preview and upload"
```

---

### Task 9: Integrate Attachment Strip into Card Detail Editor

**Files:**

- Modify: `apps/web/src/components/browse/card-detail.tsx`

**Step 1: Add the attachment strip below each field input**

Import the component:

```typescript
import { FieldAttachments } from "./field-attachments";
```

Replace the field editor section (around lines 188-199). Below each `<Input>`, add `<FieldAttachments>`:

```typescript
{noteFieldNames.map((fieldName) => (
  <div key={fieldName} className="space-y-1">
    <Label className="text-xs">{fieldName}</Label>
    <Input
      value={editFields[fieldName] ?? ""}
      onChange={(e) =>
        handleFieldChange(fieldName, e.target.value)
      }
      className="text-xs"
    />
    <FieldAttachments
      fieldValue={editFields[fieldName] ?? ""}
      onFieldChange={(newValue) =>
        handleFieldChange(fieldName, newValue)
      }
    />
  </div>
))}
```

Do the same for the fallback section (lines 201-211).

**Step 2: Run lint and verify dev server**

Run: `cd apps/web && bun run lint`
Expected: No errors

**Step 3: Commit**

```
git add apps/web/src/components/browse/card-detail.tsx
git commit -m "feat: integrate attachment strip into browse card detail editor"
```

---

### Task 10: End-to-End Verification

**Step 1: Run all tests**

Run: `cd apps/web && bun --bun vitest run`
Expected: All tests pass

**Step 2: Manual E2E test**

1. Start dev server: `bun run dev:web`
2. Import an APKG file that contains images (e.g., Ultimate Geography)
3. Verify: `data/media/` directory created with image files
4. Browse to an imported card -- verify images display in study view
5. In browse, select a card with images -- verify attachment strip shows thumbnails
6. Click X on an attachment -- verify tag removed from field text
7. Click Upload -- verify new file appears in attachment strip and tag added to field
8. Delete a note -- verify orphaned media files are removed from `data/media/`

**Step 3: Run lint one final time**

Run: `cd apps/web && bun run lint`
Expected: No errors

**Step 4: Final commit if any cleanup needed**

```
git add -A
git commit -m "chore: final cleanup for media management feature"
```
