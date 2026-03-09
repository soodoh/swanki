# Browse Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Browse page from three-panel card-centric layout to single-column note-centric layout with compact filters and modal editor.

**Architecture:** Backend refactored to group-by-note with card aggregation. Frontend becomes single column: search bar → filter row → note table. Clicking a note opens a modal with field editor + note type config tabs. Reuses existing `note-type-editor-dialog.tsx` sub-components.

**Tech Stack:** TanStack Router/React Query, Drizzle ORM, shadcn/ui Dialog/Tabs/Select/Badge, @dnd-kit (existing)

---

### Task 1: Refactor BrowseService to return notes instead of cards

**Files:**

- Modify: `apps/web/src/lib/services/browse-service.ts`
- Test: `apps/web/src/__tests__/api/browse.test.ts`

**Step 1: Update the test file to expect note-based results**

Replace the existing search tests in `apps/web/src/__tests__/api/browse.test.ts` to expect `notes` instead of `cards` in the result:

```typescript
// In describe("search") block, update all tests.
// Example for "returns all notes when query is empty":
it("returns all notes when query is empty", async () => {
  await noteService.create(userId, {
    noteTypeId,
    deckId,
    fields: { Front: "Hello", Back: "World" },
  });
  await noteService.create(userId, {
    noteTypeId,
    deckId,
    fields: { Front: "Foo", Back: "Bar" },
  });

  const result = browseService.search(userId, "");

  expect(result.notes).toHaveLength(2);
  expect(result.total).toBe(2);
  expect(result.notes[0].cardCount).toBe(1);
  expect(result.notes[0].noteTypeName).toBe("Basic");
  expect(result.notes[0].states).toContain(0); // new state
});
```

Update all other search tests similarly — change `result.cards` → `result.notes`, `result.cards[0].noteFields` → `result.notes[0].fields`, and drop `await` since BrowseService methods are synchronous.

Add a new test for multi-card notes:

```typescript
it("aggregates card data per note when note has multiple templates", async () => {
  // Add a second template
  const template2Id = generateId();
  db.insert(cardTemplates)
    .values({
      id: template2Id,
      noteTypeId,
      name: "Card 2",
      ordinal: 1,
      questionTemplate: "{{Back}}",
      answerTemplate: "{{Front}}",
    })
    .run();

  noteService.create(userId, {
    noteTypeId,
    deckId,
    fields: { Front: "Hello", Back: "World" },
  });

  const result = browseService.search(userId, "");

  expect(result.notes).toHaveLength(1);
  expect(result.notes[0].cardCount).toBe(2);
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && bun --bun vitest run src/__tests__/api/browse.test.ts`
Expected: FAIL — `result.notes` is undefined (service still returns `cards`)

**Step 3: Implement note-centric search in BrowseService**

In `apps/web/src/lib/services/browse-service.ts`, replace the existing types and `search()` method:

```typescript
// Replace BrowseCard type with BrowseNote
export type BrowseNote = {
  noteId: string;
  noteTypeId: string;
  noteTypeName: string;
  fields: Record<string, string>;
  tags: string;
  deckName: string;
  deckId: string;
  cardCount: number;
  earliestDue: string | null;
  states: number[];
  createdAt: string;
  updatedAt: string;
};

export type BrowseSearchResult = {
  notes: BrowseNote[];
  total: number;
  page: number;
  limit: number;
};
```

Update the `search()` method to:

1. Query notes (not cards) as the primary table
2. Join cards for filtering (state, due) and aggregation
3. Use `GROUP BY notes.id` with aggregation functions for card count, earliest due, and states
4. Since SQLite doesn't support array_agg natively, fetch matching notes first, then aggregate card data in a second query

Implementation approach — two-query strategy:

1. First query: SELECT DISTINCT notes matching all conditions, with pagination
2. Second query: For the returned note IDs, fetch card aggregation data (count, min due, distinct states)

This keeps the WHERE clause logic (including card state filters) working while grouping by note.

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && bun --bun vitest run src/__tests__/api/browse.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/services/browse-service.ts apps/web/src/__tests__/api/browse.test.ts
git commit -m "refactor: convert BrowseService.search to return notes instead of cards"
```

---

### Task 2: Update API route and hooks for note-based browse

**Files:**

- Modify: `apps/web/src/routes/api/browse.ts`
- Modify: `apps/web/src/lib/hooks/use-browse.ts`

**Step 1: Update API route**

In `apps/web/src/routes/api/browse.ts`:

- The GET handler already delegates to `browseService.search()` — the response shape change propagates automatically
- Add a DELETE handler for deleting notes:

```typescript
DELETE: async ({ request }) => {
  const session = await requireSession(request);
  const body = (await request.json()) as { noteId: string };

  if (!body.noteId) {
    return Response.json({ error: "noteId is required" }, { status: 400 });
  }

  noteService.delete(body.noteId, session.user.id);
  return Response.json({ success: true });
},
```

- Update the PATCH handler to accept `noteId` instead of `cardId`:

```typescript
PATCH: async ({ request }) => {
  const session = await requireSession(request);
  const body = (await request.json()) as {
    noteId: string;
    fields?: Record<string, string>;
    deckId?: string;
  };

  const { noteId, fields, deckId } = body;
  if (!noteId) {
    return Response.json({ error: "noteId is required" }, { status: 400 });
  }

  // Verify ownership
  const noteData = noteService.getById(noteId, session.user.id);
  if (!noteData) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  if (fields) {
    noteService.update(noteId, session.user.id, { fields });
    const mediaService = new MediaService(db);
    const filenames = extractMediaFilenames(fields);
    mediaService.reconcileNoteReferences(noteId, filenames);
  }

  if (deckId) {
    // Move all cards of this note to the new deck
    const cardIds = noteData.cards.map(c => c.id);
    cardService.moveToDeck(cardIds, deckId, session.user.id);
  }

  return Response.json({ success: true });
},
```

**Step 2: Update hooks**

In `apps/web/src/lib/hooks/use-browse.ts`:

- Replace `BrowseCard` type with `BrowseNote` type matching the backend
- Update `BrowseSearchResult` to have `notes` instead of `cards`
- Replace `useCardDetail` with `useNoteDetail` (fetches by noteId instead of cardId)
- Replace `useUpdateCard` with `useUpdateNote` (sends noteId)
- Add `useDeleteNote` mutation

```typescript
export type BrowseNote = {
  noteId: string;
  noteTypeId: string;
  noteTypeName: string;
  fields: Record<string, string>;
  tags: string;
  deckName: string;
  deckId: string;
  cardCount: number;
  earliestDue: string | null;
  states: number[];
  createdAt: string;
  updatedAt: string;
};

export type BrowseSearchResult = {
  notes: BrowseNote[];
  total: number;
  page: number;
  limit: number;
};

// useNoteDetail fetches /api/browse?noteId=...
// useUpdateNote sends PATCH with { noteId, fields?, deckId? }
// useDeleteNote sends DELETE with { noteId }
```

**Step 3: Run lint**

Run: `cd apps/web && bun run lint`
Expected: PASS (or only pre-existing warnings)

**Step 4: Commit**

```bash
git add apps/web/src/routes/api/browse.ts apps/web/src/lib/hooks/use-browse.ts
git commit -m "feat: update browse API and hooks for note-centric data model"
```

---

### Task 3: Add getNoteDetail to BrowseService

**Files:**

- Modify: `apps/web/src/lib/services/browse-service.ts`
- Modify: `apps/web/src/routes/api/browse.ts`

**Step 1: Add test for getNoteDetail**

```typescript
describe("getNoteDetail", () => {
  it("returns note with note type, templates, and deck", () => {
    const note = noteService.create(userId, {
      noteTypeId,
      deckId,
      fields: { Front: "Hello", Back: "World" },
      tags: "greeting",
    });

    const detail = browseService.getNoteDetail(userId, note.id);

    expect(detail).toBeDefined();
    expect(detail!.note.id).toBe(note.id);
    expect(detail!.note.fields).toStrictEqual({
      Front: "Hello",
      Back: "World",
    });
    expect(detail!.noteType.id).toBe(noteTypeId);
    expect(detail!.noteType.name).toBe("Basic");
    expect(detail!.templates).toHaveLength(1);
    expect(detail!.deckName).toBe("Japanese");
    expect(detail!.deckId).toBe(deckId);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && bun --bun vitest run src/__tests__/api/browse.test.ts`
Expected: FAIL — `getNoteDetail` doesn't exist

**Step 3: Implement getNoteDetail**

Add to `BrowseService`:

```typescript
export type NoteDetail = {
  note: Note;
  noteType: NoteType;
  templates: CardTemplate[];
  deckName: string;
  deckId: string;
};

getNoteDetail(userId: string, noteId: string): NoteDetail | undefined {
  const note = this.db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .get();

  if (!note) return undefined;

  const noteType = this.db
    .select()
    .from(noteTypes)
    .where(eq(noteTypes.id, note.noteTypeId))
    .get();

  if (!noteType) return undefined;

  const templates = this.db
    .select()
    .from(cardTemplates)
    .where(eq(cardTemplates.noteTypeId, noteType.id))
    .all();

  // Get deck from first card
  const firstCard = this.db
    .select({ deckId: cards.deckId })
    .from(cards)
    .where(eq(cards.noteId, noteId))
    .limit(1)
    .get();

  let deckName = "";
  let deckId = "";
  if (firstCard) {
    const deck = this.db
      .select()
      .from(decks)
      .where(eq(decks.id, firstCard.deckId))
      .get();
    if (deck) {
      deckName = deck.name;
      deckId = deck.id;
    }
  }

  return { note, noteType, templates, deckName, deckId };
}
```

Update the API route GET handler to accept `noteId` param:

```typescript
const noteId = url.searchParams.get("noteId");
if (noteId) {
  const detail = browseService.getNoteDetail(session.user.id, noteId);
  if (!detail) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  return Response.json(detail);
}
```

**Step 4: Run tests**

Run: `cd apps/web && bun --bun vitest run src/__tests__/api/browse.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/services/browse-service.ts apps/web/src/routes/api/browse.ts
git commit -m "feat: add getNoteDetail endpoint for note editor modal"
```

---

### Task 4: Create compact browse-filters component

**Files:**

- Create: `apps/web/src/components/browse/browse-filters.tsx`

**Step 1: Create the component**

This replaces `filter-sidebar.tsx`. Port the same filter logic (deck, state, tags) but as an inline row. Add note type filter.

```tsx
import { useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDecks } from "@/lib/hooks/use-decks";
import { useNoteTypes } from "@/lib/hooks/use-note-types";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";
import type { BrowseNote } from "@/lib/hooks/use-browse";

type BrowseFiltersProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  notes: BrowseNote[] | undefined;
};

// Reuse filter helpers from filter-sidebar (copy the 4 helper functions:
// flattenDecks, collapseWhitespace, hasFilter, toggleFilter)

export function BrowseFilters({
  searchQuery,
  onSearchChange,
  notes,
}: BrowseFiltersProps): React.ReactElement {
  // Same logic as FilterSidebar but rendered inline:
  // - Deck select (compact, fix __all__ → "All Decks" display using placeholder prop)
  // - Note type select (new, uses notetype: prefix)
  // - State toggle buttons (New / Review / Due)
  // - Tag badges (extracted from current result notes)
  // Layout: flex-wrap row with gap-2
}
```

Key differences from `filter-sidebar.tsx`:

- Layout is `flex flex-wrap items-center gap-2` instead of vertical sidebar
- Deck select uses `placeholder="All Decks"` and value is empty string for "all" (not `__all__`)
- Add Note Type select with `notetype:` prefix filter
- State filters are toggle buttons (Button variant toggled) instead of checkboxes
- Tags are inline badges in the same row
- Extract tags from `notes[].tags` instead of `cards[].noteTags`

**Step 2: Run lint**

Run: `cd apps/web && bun run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/browse/browse-filters.tsx
git commit -m "feat: create compact browse-filters component"
```

---

### Task 5: Create note-table component

**Files:**

- Create: `apps/web/src/components/browse/note-table.tsx`

**Step 1: Create the component**

Port from `card-table.tsx` but adapted for `BrowseNote[]`:

```tsx
import { useCallback, useMemo } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BrowseNote, BrowseOptions } from "@/lib/hooks/use-browse";

type NoteTableProps = {
  notes: BrowseNote[] | undefined;
  total: number;
  page: number;
  limit: number;
  selectedNoteId: string | undefined;
  onSelectNote: (noteId: string) => void;
  sortBy: BrowseOptions["sortBy"];
  sortDir: BrowseOptions["sortDir"];
  onSortChange: (
    sortBy: BrowseOptions["sortBy"],
    sortDir: BrowseOptions["sortDir"],
  ) => void;
  onPageChange: (page: number) => void;
  isLoading: boolean;
};

// Columns: Preview | Deck | Cards | Due | State
// - Preview: first field value, strip HTML, truncate 80 chars
// - Deck: note.deckName
// - Cards: note.cardCount
// - Due: formatDue(note.earliestDue) — handle null as "-"
// - State: map note.states to Badge components using STATE_LABELS/STATE_VARIANTS

// Pagination footer: same pattern as card-table but shows "X notes found"
// Click row → onSelectNote(note.noteId)
```

Reuse `getQuestionPreview()`, `formatDue()` from card-table. Adapt `STATE_LABELS` and `STATE_VARIANTS` for multi-state badges.

**Step 2: Run lint**

Run: `cd apps/web && bun run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/browse/note-table.tsx
git commit -m "feat: create note-table component for browse page"
```

---

### Task 6: Create note-editor-dialog component

**Files:**

- Create: `apps/web/src/components/browse/note-editor-dialog.tsx`

**Step 1: Create the dialog**

This is a Dialog with 5 tabs. The Note tab is custom; tabs 2-5 reuse sub-components from `note-type-editor-dialog.tsx`.

To enable reuse, first extract `FieldsTab`, `TemplatesTab`, `CssTab`, and `PreviewTab` from `note-type-editor-dialog.tsx` — OR import the whole dialog's internal components. Since those components are not exported, the simplest approach is to **duplicate the note type editor tab logic inline** in the new dialog, fetching the note type via `useNoteType(noteTypeId)`. This avoids refactoring the existing dialog.

Actually, the cleanest approach: the note editor dialog fetches note detail (for the Note tab) AND note type data (for tabs 2-5) via two hooks: `useNoteDetail(noteId)` + `useNoteType(noteTypeId)`.

Structure:

```tsx
export function NoteEditorDialog({
  noteId,
  open,
  onOpenChange,
}: {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  // Hooks
  const { data: noteDetail } = useNoteDetail(noteId);
  const { data: noteTypeData } = useNoteType(noteDetail?.noteType.id);
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  // Tab 1: Note — field editors with FieldAttachments, deck select, save
  // Tabs 2-5: Reuse NoteTypeEditorDialog's internal components
  //   (FieldsTab, TemplatesTab, CssTab, PreviewTab)
  //   These need to be extracted or reimported.

  // Footer: Delete button with AlertDialog confirmation
}
```

For the Note tab, port the field editing UI from `card-detail.tsx`:

- `editFields` state initialized from `noteDetail.note.fields`
- For each field in noteType.fields: Label + Input + FieldAttachments
- Deck select dropdown
- Save button calls `useUpdateNote`

For deletion:

- "Delete Note" button in dialog footer (destructive variant)
- Opens AlertDialog confirmation: "This will permanently delete this note and all X cards."
- On confirm: call `deleteNote.mutateAsync(noteId)`, close dialog

For tabs 2-5, since the sub-components in `note-type-editor-dialog.tsx` aren't exported, the plan is:

1. Extract `FieldsTab`, `TemplatesTab`, `CssTab`, `PreviewTab` into a shared file `apps/web/src/components/note-type-editor-tabs.tsx`
2. Import them in both `note-type-editor-dialog.tsx` and `note-editor-dialog.tsx`

This keeps things DRY.

**Step 2: Extract shared tab components**

Create `apps/web/src/components/note-type-editor-tabs.tsx` by moving `FieldsTab`, `TemplatesTab`, `CssTab`, `PreviewTab`, `TemplateEditor`, `SortableFieldItem`, and `NameEditor` from `note-type-editor-dialog.tsx`. Export them all.

Update `note-type-editor-dialog.tsx` to import from the new shared file.

**Step 3: Run lint**

Run: `cd apps/web && bun run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/note-type-editor-tabs.tsx \
       apps/web/src/components/note-type-editor-dialog.tsx \
       apps/web/src/components/browse/note-editor-dialog.tsx
git commit -m "feat: create note-editor-dialog with shared note type tabs"
```

---

### Task 7: Wire up the browse page with new components

**Files:**

- Modify: `apps/web/src/routes/_authenticated/browse.tsx`

**Step 1: Update the browse page**

Replace the three-panel layout with single-column:

```tsx
import { SearchBar } from "@/components/browse/search-bar";
import { BrowseFilters } from "@/components/browse/browse-filters";
import { NoteTable } from "@/components/browse/note-table";
import { NoteEditorDialog } from "@/components/browse/note-editor-dialog";
import { useBrowse } from "@/lib/hooks/use-browse";

function BrowsePage(): React.ReactElement {
  // Replace selectedCardId with selectedNoteId
  const [selectedNoteId, setSelectedNoteId] = useState<string | undefined>(undefined);

  // useBrowse now returns { notes, total, page, limit }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Search bar */}
      <div className="shrink-0 border-b p-4">
        <SearchBar ... />
        <BrowseFilters
          searchQuery={typedQ}
          onSearchChange={handleFilterChange}
          notes={data?.notes}
        />
      </div>

      {/* Note table — full width, no sidebar */}
      <div className="min-h-0 flex-1 p-4">
        <NoteTable
          notes={data?.notes}
          total={data?.total ?? 0}
          page={data?.page ?? typedPage}
          limit={data?.limit ?? 50}
          selectedNoteId={selectedNoteId}
          onSelectNote={setSelectedNoteId}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
          isLoading={isLoading}
        />
      </div>

      {/* Note editor modal */}
      {selectedNoteId && (
        <NoteEditorDialog
          noteId={selectedNoteId}
          open={Boolean(selectedNoteId)}
          onOpenChange={(open) => {
            if (!open) setSelectedNoteId(undefined);
          }}
        />
      )}
    </div>
  );
}
```

Remove imports of `FilterSidebar`, `CardTable`, `CardDetailPanel`.

**Step 2: Update search-bar placeholder text**

In `apps/web/src/components/browse/search-bar.tsx`, change placeholder from "Search cards..." to "Search notes..."

**Step 3: Run lint and build**

Run: `cd apps/web && bun run lint && bun run build`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/routes/_authenticated/browse.tsx \
       apps/web/src/components/browse/search-bar.tsx
git commit -m "feat: wire up browse page with note-centric components"
```

---

### Task 8: Clean up old components

**Files:**

- Delete: `apps/web/src/components/browse/filter-sidebar.tsx`
- Delete: `apps/web/src/components/browse/card-detail.tsx`
- Delete: `apps/web/src/components/browse/card-table.tsx`

**Step 1: Delete the old files**

These are fully replaced by `browse-filters.tsx`, `note-editor-dialog.tsx`, and `note-table.tsx`.

**Step 2: Verify no remaining imports**

Run: `grep -r "filter-sidebar\|card-detail\|card-table\|CardTable\|CardDetailPanel\|FilterSidebar" apps/web/src/ --include="*.tsx" --include="*.ts"`
Expected: No results

**Step 3: Run lint and build**

Run: `cd apps/web && bun run lint && bun run build`
Expected: PASS

**Step 4: Run all tests**

Run: `cd apps/web && bun --bun vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git rm apps/web/src/components/browse/filter-sidebar.tsx \
      apps/web/src/components/browse/card-detail.tsx \
      apps/web/src/components/browse/card-table.tsx
git commit -m "refactor: remove old card-centric browse components"
```

---

### Task 9: Add notetype search filter support

**Files:**

- Modify: `apps/web/src/lib/search-parser.ts`
- Modify: `apps/web/src/lib/services/browse-service.ts`

**Step 1: Add test for notetype filter**

In `apps/web/src/__tests__/api/browse.test.ts`:

```typescript
it("filters by note type name", () => {
  // Create a second note type
  const noteType2Id = generateId();
  db.insert(noteTypes)
    .values({
      id: noteType2Id,
      userId,
      name: "Cloze",
      fields: [{ name: "Text", ordinal: 0 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  const template2Id = generateId();
  db.insert(cardTemplates)
    .values({
      id: template2Id,
      noteTypeId: noteType2Id,
      name: "Cloze Card",
      ordinal: 0,
      questionTemplate: "{{cloze:Text}}",
      answerTemplate: "{{cloze:Text}}",
    })
    .run();

  noteService.create(userId, {
    noteTypeId,
    deckId,
    fields: { Front: "Basic note", Back: "Answer" },
  });
  noteService.create(userId, {
    noteTypeId: noteType2Id,
    deckId,
    fields: { Text: "Cloze note" },
  });

  const result = browseService.search(userId, "notetype:Basic");

  expect(result.notes).toHaveLength(1);
  expect(result.notes[0].noteTypeName).toBe("Basic");
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && bun --bun vitest run src/__tests__/api/browse.test.ts`
Expected: FAIL

**Step 3: Add notetype node to search parser**

In `apps/web/src/lib/search-parser.ts`, add `"notetype"` as a recognized filter prefix (alongside deck, tag, is). Add `NoteTypeNode` to the AST.

In `apps/web/src/lib/services/browse-service.ts`, add a case in `nodeToCondition()`:

```typescript
case "notetype":
  return eq(noteTypes.name, node.value);
```

This requires joining `noteTypes` in the query — already done since we join through `notes.noteTypeId`.

**Step 4: Run tests**

Run: `cd apps/web && bun --bun vitest run src/__tests__/api/browse.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/search-parser.ts apps/web/src/lib/services/browse-service.ts apps/web/src/__tests__/api/browse.test.ts
git commit -m "feat: add notetype: search filter for browse"
```

---

### Task 10: Manual QA and final polish

**Step 1: Start dev server**

Run: `bun run dev:web`

**Step 2: Test the browse page**

Verify:

- Search bar and compact filter row render correctly
- Deck dropdown shows "All Decks" (not `__all__`)
- Note type dropdown works
- State toggle buttons filter correctly
- Tags appear and toggle
- Table shows one row per note with correct card count, due, states
- Clicking a row opens the note editor modal
- Note tab: field editing + save works
- Fields/Templates/CSS/Preview tabs work (same as note type editor)
- Delete button works with confirmation
- Pagination works correctly (counts notes)

**Step 3: Fix any issues found during QA**

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix: browse page polish from QA"
```
