import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  BookOpen,
  Layers,
  MoreHorizontal,
  Settings,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useDeleteDeck,
  useUpdateDeck,
} from "@/lib/hooks/use-decks";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";

function CountCell({
  value,
  color,
}: {
  value: number;
  color: string;
}): React.ReactElement {
  return (
    <span
      className={`w-8 text-right tabular-nums text-xs font-medium ${
        value > 0 ? color : "text-muted-foreground/40"
      }`}
    >
      {value}
    </span>
  );
}

function DeckCountBadges({ deckId }: { deckId: string }): React.ReactElement {
  const { data: counts } = useDeckCounts(deckId);

  const n = counts?.new ?? 0;
  const l = counts?.learning ?? 0;
  const r = counts?.review ?? 0;

  return (
    <div className="flex items-center gap-1">
      <CountCell value={n} color="text-blue-700 dark:text-blue-400" />
      <CountCell value={l} color="text-orange-700 dark:text-orange-400" />
      <CountCell value={r} color="text-green-700 dark:text-green-400" />
    </div>
  );
}

function DeckOptionsDialog({
  deck,
  allDecks,
  open,
  onOpenChange,
}: {
  deck: DeckTreeNode;
  allDecks: DeckTreeNode[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [name, setName] = useState(deck.name);
  const [description, setDescription] = useState(deck.description ?? "");
  const [parentId, setParentId] = useState<string>(deck.parentId ?? "");
  const [newCardsPerDay, setNewCardsPerDay] = useState(
    String(deck.settings?.newCardsPerDay ?? 20),
  );
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(
    String(deck.settings?.maxReviewsPerDay ?? 200),
  );
  const updateDeck = useUpdateDeck();

  const parentOptions = allDecks.filter((d) => d.id !== deck.id);

  async function handleSave(): Promise<void> {
    await updateDeck.mutateAsync({
      deckId: deck.id,
      name: name.trim(),
      description: description.trim(),
      parentId: parentId || undefined,
      settings: {
        newCardsPerDay: Number(newCardsPerDay) || 20,
        maxReviewsPerDay: Number(maxReviewsPerDay) || 200,
      },
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deck Options</DialogTitle>
          <DialogDescription>
            Configure settings for this deck.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="opt-name">Name</Label>
            <Input
              id="opt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="opt-description">Description</Label>
            <textarea
              id="opt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="opt-parent">Parent Deck</Label>
            <select
              id="opt-parent"
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">None (top-level)</option>
              {parentOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="opt-new-cards">New Cards/Day</Label>
              <Input
                id="opt-new-cards"
                type="number"
                min="0"
                max="9999"
                value={newCardsPerDay}
                onChange={(e) => setNewCardsPerDay(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="opt-max-reviews">Max Reviews/Day</Label>
              <Input
                id="opt-max-reviews"
                type="number"
                min="0"
                max="9999"
                value={maxReviewsPerDay}
                onChange={(e) => setMaxReviewsPerDay(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!name.trim() || updateDeck.isPending}
          >
            {updateDeck.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeckActionMenu({
  node,
  allDecks,
}: {
  node: DeckTreeNode;
  allDecks: DeckTreeNode[];
}): React.ReactElement {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const deleteDeck = useDeleteDeck();
  const hasChildren = node.children.length > 0;

  async function handleDelete(): Promise<void> {
    await deleteDeck.mutateAsync(node.id);
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
          <DropdownMenuItem onClick={() => setOptionsOpen(true)}>
            <Settings className="size-4" />
            Options
          </DropdownMenuItem>
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

      <DeckOptionsDialog
        deck={node}
        allDecks={allDecks}
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Deck</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{node.name}</strong>?
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

function DeckTreeItem({
  node,
  allDecks,
  depth = 0,
}: {
  node: DeckTreeNode;
  allDecks: DeckTreeNode[];
  depth?: number;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

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

        <span className="flex-1 truncate text-sm font-medium">{node.name}</span>

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

        <DeckActionMenu node={node} allDecks={allDecks} />
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <DeckTreeItem
              key={child.id}
              node={child}
              allDecks={allDecks}
              depth={depth + 1}
            />
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

function flattenDecks(nodes: DeckTreeNode[]): DeckTreeNode[] {
  const result: DeckTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenDecks(node.children));
    }
  }
  return result;
}

export function DeckTree({
  decks,
}: {
  decks: DeckTreeNode[];
}): React.ReactElement {
  const allDecks = useMemo(() => flattenDecks(decks), [decks]);

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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-5 shrink-0" />
              <span className="size-4 shrink-0" />
              <span className="flex-1">Name</span>
              <div className="flex items-center gap-1">
                <span className="w-8 text-right text-blue-600 dark:text-blue-400">
                  New
                </span>
                <span className="w-8 text-right text-orange-600 dark:text-orange-400">
                  Learn
                </span>
                <span className="w-8 text-right text-green-600 dark:text-green-400">
                  Due
                </span>
              </div>
              <span className="w-16" />
            </div>
          </div>
          <div className="py-1">
            {decks.map((deck) => (
              <DeckTreeItem key={deck.id} node={deck} allDecks={allDecks} />
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
