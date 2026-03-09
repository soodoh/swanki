# Browse Page Redesign

## Summary

Redesign the Browse page from a three-panel card-centric layout to a single-column note-centric layout with compact filters and a modal editor.

## 1. Backend: Note-centric search

Refactor `BrowseService.search()` to group by note instead of returning individual cards.

**New return type:**

```typescript
BrowseNote = {
  noteId: string;
  noteTypeId: string;
  noteTypeName: string;
  fields: Record<string, string>;
  tags: string;
  deckName: string;
  deckId: string;
  cardCount: number;
  earliestDue: string | null;
  states: number[];  // unique card states, e.g. [0, 2] = new + review
  createdAt: string;
  updatedAt: string;
}

BrowseSearchResult = {
  notes: BrowseNote[];
  total: number;  // total notes matching
  page: number;
  limit: number;
}
```

- Query changes from `SELECT cards JOIN notes` to `SELECT notes` with card data aggregated.
- Filters like `is:new` filter to notes that have at least one card matching that state.
- Pagination counts notes, not cards.

## 2. Filter layout: Compact row under search bar

Remove the filter sidebar. Replace with a compact row of inline controls beneath the search bar:

- **Deck dropdown** — fix `__all__` to show "All Decks"
- **Note Type dropdown** — new filter using `notetype:Name` syntax
- **Card State toggles** — small toggle buttons for New / Review / Due
- **Tags** — clickable badge chips inline

Layout: `[Deck ▾] [Note Type ▾] [New] [Review] [Due] [tag1] [tag2] ...`

Single-column page layout — no sidebar, no right detail panel.

## 3. Note table

Replace `card-table.tsx` with note-oriented table:

**Columns:**

- **Preview** — first field value, HTML stripped, truncated (~80 chars)
- **Deck** — deck name
- **Cards** — count
- **Due** — earliest due date, relative format
- **State** — badges for each unique state across the note's cards

**Behavior:**

- Click row → opens note editor modal
- Sorting on Due column (by earliest due)
- Pagination counts notes

## 4. Note editor modal

Dialog with 5 tabs:

**Tab 1: "Note" (default)**

- Editable fields for each note field (with FieldAttachments for media)
- Deck selector dropdown
- Tags display
- Save button

**Tab 2: "Fields"** — note type field schema (add/remove/reorder, drag-and-drop)

**Tab 3: "Templates"** — card template editor (question/answer)

**Tab 4: "CSS"** — custom styling textarea

**Tab 5: "Preview"** — rendered card preview

**Footer:** Delete button with confirmation dialog. Deletes note and all derived cards.

Tabs 2-5 edit the underlying note type (reuses logic from `note-type-editor-dialog.tsx`).

## Files affected

**Backend:**

- `apps/web/src/lib/services/browse-service.ts` — refactor search to group by note
- `apps/web/src/routes/api/browse.ts` — update API response shape, add DELETE endpoint for notes

**Frontend (modify):**

- `apps/web/src/routes/_authenticated/browse.tsx` — remove three-panel layout, single column
- `apps/web/src/components/browse/search-bar.tsx` — minor (stays mostly the same)
- `apps/web/src/lib/hooks/use-browse.ts` — update types, add delete mutation

**Frontend (remove):**

- `apps/web/src/components/browse/filter-sidebar.tsx` — replaced by inline filters
- `apps/web/src/components/browse/card-detail.tsx` — replaced by modal

**Frontend (create):**

- `apps/web/src/components/browse/browse-filters.tsx` — compact filter row
- `apps/web/src/components/browse/note-table.tsx` — note-oriented table
- `apps/web/src/components/browse/note-editor-dialog.tsx` — modal with 5 tabs
