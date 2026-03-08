# Deck Action Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an always-visible three-dot menu to each deck row with Rename (inline), Options (navigate), and Delete (with confirmation) actions.

**Architecture:** Add `useRenameDeck` and `useDeleteDeck` React Query hooks, then modify `DeckTreeItem` to include a dropdown menu trigger and inline rename/delete dialog state.

**Tech Stack:** React, TanStack React Query, @base-ui DropdownMenu, lucide-react icons

---

### Task 1: Add React Query hooks for rename and delete

**Files:**

- Modify: `apps/web/src/lib/hooks/use-decks.ts`

**Step 1: Add `useRenameDeck` and `useDeleteDeck` hooks**

Add these two hooks after the existing `useDeckCounts` function:

```tsx
export function useRenameDeck(): UseMutationResult<
  void,
  Error,
  { deckId: string; name: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { deckId: string; name: string }) => {
      const res = await fetch(`/api/decks/${data.deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name }),
      });
      if (!res.ok) {
        throw new Error("Failed to rename deck");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export function useDeleteDeck(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deckId: string) => {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete deck");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}
```

**Step 2: Verify the hooks compile**

Run: `cd apps/web && bun run build --filter=web 2>&1 | head -20`

**Step 3: Commit**

```
git add apps/web/src/lib/hooks/use-decks.ts
git commit -m "feat: add useRenameDeck and useDeleteDeck hooks"
```

---

### Task 2: Add the three-dot dropdown menu to DeckTreeItem

**Files:**

- Modify: `apps/web/src/components/deck-tree.tsx`

**Step 1: Add imports**

Add to the lucide-react import:

```tsx
import {
  ChevronRight,
  ChevronDown,
  Plus,
  BookOpen,
  Layers,
  MoreHorizontal,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
```

Add dropdown menu import:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

Add Link import for navigation (already imported).

Add hooks import — update the existing import:

```tsx
import {
  useCreateDeck,
  useDeckCounts,
  useRenameDeck,
  useDeleteDeck,
} from "@/lib/hooks/use-decks";
```

**Step 2: Create a `DeckActionMenu` component**

Add this component before `DeckTreeItem`:

```tsx
function DeckActionMenu({
  deckId,
  deckName,
  hasChildren,
  onRename,
}: {
  deckId: string;
  deckName: string;
  hasChildren: boolean;
  onRename: () => void;
}): React.ReactElement {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteDeck = useDeleteDeck();

  async function handleDelete(): Promise<void> {
    await deleteDeck.mutateAsync(deckId);
    setDeleteOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-xs">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuItem onClick={onRename}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link to="/decks/$deckId" params={{ deckId }}>
                <Settings />
                Options
              </Link>
            }
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Deck</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deckName}</strong>?
              {hasChildren && " Child decks will be moved to the parent deck."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteDeck.isPending}
            >
              {deleteDeck.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Step 3: Add inline rename state and update `DeckTreeItem`**

Replace the entire `DeckTreeItem` function with:

```tsx
function DeckTreeItem({
  node,
  depth = 0,
}: {
  node: DeckTreeNode;
  depth?: number;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.name);
  const renameDeck = useRenameDeck();
  const hasChildren = node.children.length > 0;

  function startRename(): void {
    setRenameName(node.name);
    setIsRenaming(true);
  }

  async function submitRename(): Promise<void> {
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === node.name) {
      setIsRenaming(false);
      return;
    }
    await renameDeck.mutateAsync({ deckId: node.id, name: trimmed });
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      void submitRename();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
    }
  }

  return (
    <div>
      <div
        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${String(depth * 20 + 8)}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}

        <Layers className="size-4 shrink-0 text-muted-foreground" />

        {isRenaming ? (
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onBlur={() => void submitRename()}
            onKeyDown={handleRenameKeyDown}
            className="h-6 flex-1 text-sm"
            autoFocus
          />
        ) : (
          <span className="flex-1 truncate text-sm font-medium">
            {node.name}
          </span>
        )}

        {!isRenaming && (
          <>
            <DeckCountBadges deckId={node.id} />

            <Link
              to="/study/$deckId"
              params={{ deckId: node.id }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Button variant="ghost" size="xs">
                <BookOpen className="size-3.5" />
                Study
              </Button>
            </Link>

            <DeckActionMenu
              deckId={node.id}
              deckName={node.name}
              hasChildren={hasChildren}
              onRename={startRename}
            />
          </>
        )}
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <DeckTreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Verify it compiles**

Run: `cd apps/web && bun run build --filter=web 2>&1 | head -20`

**Step 5: Manual testing**

Run: `bun run dev:web`

Verify:

- Three-dot menu is always visible on each deck row
- Clicking "Rename" switches to inline input with current name
- Pressing Enter saves the new name
- Pressing Escape cancels
- Clicking "Options" navigates to `/decks/$deckId`
- Clicking "Delete" opens confirmation dialog
- Confirming delete removes the deck and child decks are re-parented

**Step 6: Commit**

```
git add apps/web/src/components/deck-tree.tsx
git commit -m "feat: add deck action menu with rename, options, and delete"
```
