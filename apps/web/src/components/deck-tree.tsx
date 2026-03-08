import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
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

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCreateDeck,
  useDeckCounts,
  useRenameDeck,
  useDeleteDeck,
} from "@/lib/hooks/use-decks";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";

function DeckCountBadges({
  deckId,
}: {
  deckId: string;
}): React.ReactElement | undefined {
  const { data: counts } = useDeckCounts(deckId);

  if (!counts) {
    return undefined;
  }

  const hasCards = counts.new > 0 || counts.learning > 0 || counts.review > 0;
  if (!hasCards) {
    return undefined;
  }

  return (
    <div className="flex items-center gap-1">
      {counts.new > 0 && (
        <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-0 tabular-nums">
          {counts.new}
        </Badge>
      )}
      {counts.learning > 0 && (
        <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-0 tabular-nums">
          {counts.learning}
        </Badge>
      )}
      {counts.review > 0 && (
        <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-0 tabular-nums">
          {counts.review}
        </Badge>
      )}
    </div>
  );
}

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
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link to="/decks/$deckId" params={{ deckId }}>
                <Settings className="size-4" />
                Options
              </Link>
            }
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
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
              {hasChildren &&
                " This will also delete all child decks and their cards."}
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

function DeckTreeItem({
  node,
  depth = 0,
}: {
  node: DeckTreeNode;
  depth?: number;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const renameDeck = useRenameDeck();
  const hasChildren = node.children.length > 0;

  function startRename(): void {
    setRenameName(node.name);
    setIsRenaming(true);
  }

  async function submitRename(): Promise<void> {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== node.name) {
      await renameDeck.mutateAsync({ deckId: node.id, name: trimmed });
    }
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      void submitRename();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
    }
  }

  const renameInputRef = useRef<HTMLInputElement>(undefined);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
    }
  }, [isRenaming]);

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
            ref={renameInputRef}
            className="h-6 flex-1 text-sm"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onBlur={() => void submitRename()}
            onKeyDown={handleRenameKeyDown}
          />
        ) : (
          <>
            <span className="flex-1 truncate text-sm font-medium">
              {node.name}
            </span>

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

function AddDeckDialog({
  parentId,
}: {
  parentId?: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const createDeck = useCreateDeck();

  async function handleSubmit(
    e: React.SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    await createDeck.mutateAsync({
      name: name.trim(),
      parentId,
    });

    setName("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-4" data-icon="inline-start" />
            Add Deck
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Deck</DialogTitle>
          <DialogDescription>
            Give your deck a name to get started.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Deck name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={!name.trim() || createDeck.isPending}
            >
              {createDeck.isPending ? "Creating..." : "Create Deck"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeckTree({
  decks,
}: {
  decks: DeckTreeNode[];
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Decks</h2>
        <AddDeckDialog />
      </div>

      {decks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="px-3 py-2 border-b">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex-1">Name</span>
              <div className="flex items-center gap-3">
                <span className="text-blue-600 dark:text-blue-400">New</span>
                <span className="text-orange-600 dark:text-orange-400">
                  Learn
                </span>
                <span className="text-green-600 dark:text-green-400">Due</span>
              </div>
              <span className="w-16" />
            </div>
          </div>
          <div className="py-1">
            {decks.map((deck) => (
              <DeckTreeItem key={deck.id} node={deck} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 mb-4">
        <Layers className="size-6 text-primary" />
      </div>
      <h3 className="text-base font-medium mb-1">No decks yet</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Create your first deck to start studying.
      </p>
      <AddDeckDialog />
    </div>
  );
}
