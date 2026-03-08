# Deck Action Menu Design

## Summary

Add an always-visible three-dot menu to each deck row in the deck tree with Rename, Options, and Delete actions. Export is deferred to a future iteration.

## UI Trigger

Always-visible `MoreHorizontal` icon button at the end of each `DeckTreeItem` row, next to the Study button. Uses `ghost` variant with `icon-xs` size.

## Menu Items

Using the existing `DropdownMenu` component:

- **Rename** (`Pencil` icon) — triggers inline editing mode on the deck name
- **Options** (`Settings` icon) — navigates to `/decks/$deckId`
- **Delete** (`Trash2` icon, destructive styling) — opens confirmation dialog

## Rename (Inline Editing)

When triggered, the deck name text in `DeckTreeItem` is replaced with a text input pre-filled with the current name. Enter saves (PUT to `/api/decks/$deckId`), Escape cancels, blur also saves.

## Delete Confirmation

A `Dialog` with:

- Title: "Delete Deck"
- Body: "Are you sure you want to delete **{deckName}**?" If the deck has children: "Child decks will be moved to the parent deck."
- Buttons: Cancel (outline) and Delete (destructive)
- Deleting re-parents child decks to the deleted deck's parent (existing backend behavior)

## New React Query Hooks

- `useRenameDeck()` — wraps PUT `/api/decks/$deckId` with `{ name }`, invalidates `["decks"]` query
- `useDeleteDeck()` — wraps DELETE `/api/decks/$deckId`, invalidates `["decks"]` query

## Files Modified

- `apps/web/src/components/deck-tree.tsx` — add menu button, inline rename state, delete dialog
- `apps/web/src/lib/hooks/use-decks.ts` — add `useRenameDeck` and `useDeleteDeck` hooks

## Deferred

- Export (APKG or other format) — will be added in a future iteration
