# Drag-and-Drop Deck Reparenting

## Overview

Add Anki-style drag-and-drop to the dashboard deck tree, allowing users to reparent decks by dragging them onto other decks or to root level. Siblings are always sorted alphabetically — no manual ordering.

## Behaviors

### Drop on a deck

Dragged deck becomes a child of the target deck. Its `parentId` is set to the target deck's ID.

### Drop on empty space

Dragged deck becomes a root-level deck. Its `parentId` is set to `null`.

### Validation

- Cannot drop a deck on itself
- Cannot drop a deck on any of its own descendants (prevents circular hierarchy)
- Invalid targets receive no visual feedback during drag

### Sorting

Sibling decks are always sorted alphabetically by name. No ordering field is needed in the schema.

## Technical Design

### Library

dnd-kit (`@dnd-kit/core`, already installed and used in `note-type-editor-tabs.tsx`).

### Components

**DeckTree (modified)**

- Wrap in `DndContext` with collision detection
- Add a root-level `useDroppable` zone for dropping to make decks top-level
- Render a `DragOverlay` showing the dragged deck name

**DeckTreeItem (modified)**

- Add `useDraggable` to make each deck draggable
- Add `useDroppable` to make each deck a drop target
- Visual states during drag:
  - **Dragged item**: dims in place
  - **Valid drop target on hover**: highlighted border/background
  - **Invalid target**: no highlight
- Drag handle: the entire row (or a grip icon, matching existing pattern)

### Drop Handler

On drop:

1. Determine new `parentId` — target deck's ID, or `null` if dropped on root zone
2. Skip if `parentId` unchanged
3. Call `useUpdateDeck` mutation with `{ parentId }`
4. Optimistic update in React Query cache for instant feedback

### Circular Drop Prevention

Build a set of descendant IDs for the dragged deck. Any deck in that set (plus the dragged deck itself) is an invalid drop target. Compute this from the existing tree data in the React Query cache.

### API

No API changes needed. `PUT /api/decks/$deckId` already accepts `parentId` updates.

### Schema

No schema changes needed. `parentId` field already exists on the `decks` table.

### Alphabetical Sort

Verify that `DeckService.buildTree()` sorts children alphabetically. If not, add `.sort()` by name.

## Files to Modify

| File                               | Change                                                         |
| ---------------------------------- | -------------------------------------------------------------- |
| `src/components/deck-tree.tsx`     | Add DndContext, DragOverlay, root droppable zone, drop handler |
| `src/lib/services/deck-service.ts` | Ensure `buildTree()` sorts children alphabetically             |

## Out of Scope

- Drag-and-drop reordering (siblings always alphabetical)
- Touch/mobile drag support (can be added later)
- Drag between different views (only dashboard deck tree)
