# Note Type Editor Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert note type editing from a separate route to a Dialog overlay on the list page.

**Architecture:** Extract editor components from `$noteTypeId.tsx` into a new dialog component. Update list page to manage selected state and render the dialog. Delete the old route file.

**Tech Stack:** React, shadcn/ui Dialog, TanStack Router, React Query

---

### Task 1: Create the note type editor dialog component

**Files:**

- Create: `apps/web/src/components/note-type-editor-dialog.tsx`
- Reference: `apps/web/src/routes/_authenticated/note-types/$noteTypeId.tsx`

**Step 1: Create `note-type-editor-dialog.tsx`**

Move all editor components from `$noteTypeId.tsx` into this new file, wrapped in a Dialog. The component accepts `noteTypeId`, `open`, and `onOpenChange` props.

Components to move:

- `NoteTypeEditorContent` (adapted to live inside DialogContent)
- `NameEditor`
- `FieldsTab`
- `TemplatesTab` + `TemplateEditor`
- `CssTab`
- `PreviewTab`

The dialog should:

- Use `max-w-4xl` on DialogContent for adequate width
- Put the note type name in `DialogTitle`
- Use `DialogDescription` with brief text
- Keep all 4 tabs (Fields, Templates, CSS, Preview) identical to current
- Handle loading/error states inside the dialog
- Fetch data via `useNoteType(noteTypeId)` internally

**Step 2: Verify it builds**

Run: `cd apps/web && bun run build`

**Step 3: Commit**

```
feat: extract note type editor into dialog component
```

---

### Task 2: Update list page to use dialog instead of route navigation

**Files:**

- Modify: `apps/web/src/routes/_authenticated/note-types/index.tsx`

**Step 1: Update `index.tsx`**

- Add `selectedNoteTypeId` state
- Replace `<Link>` overlay on cards with an `onClick` that sets `selectedNoteTypeId`
- Import and render `NoteTypeEditorDialog` with `open={!!selectedNoteTypeId}` and `onOpenChange`
- Remove `Link` import if no longer needed

**Step 2: Verify it builds**

Run: `cd apps/web && bun run build`

**Step 3: Commit**

```
feat: open note type editor as modal overlay
```

---

### Task 3: Delete old route file

**Files:**

- Delete: `apps/web/src/routes/_authenticated/note-types/$noteTypeId.tsx`

**Step 1: Delete the file**

Remove `$noteTypeId.tsx`. TanStack Router will auto-regenerate `routeTree.gen.ts` on next build.

**Step 2: Regenerate route tree and verify build**

Run: `cd apps/web && bun run build`

Verify `routeTree.gen.ts` no longer references the `$noteTypeId` route.

**Step 3: Commit**

```
refactor: remove standalone note type editor route
```
