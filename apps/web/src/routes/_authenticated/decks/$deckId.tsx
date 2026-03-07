import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useDecks, useDeckCounts } from "@/lib/hooks/use-decks";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";
import { useReviewsPerDay } from "@/lib/hooks/use-stats";

export const Route = createFileRoute("/_authenticated/decks/$deckId")({
  component: DeckSettingsPage,
});

type DeckData = {
  id: string;
  name: string;
  description: string;
  parentId: string | undefined;
  settings: { newCardsPerDay: number; maxReviewsPerDay: number } | undefined;
};

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

function findDeck(nodes: DeckTreeNode[], id: string): DeckTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findDeck(node.children, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

const EMPTY_DECKS: DeckTreeNode[] = [];

function DeckSettingsPage(): React.ReactElement {
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- TanStack Router params are typed via route tree generation
  const { deckId } = Route.useParams();
  const { data: decks, isLoading: decksLoading } = useDecks();
  // oxlint-disable-next-line typescript/no-unsafe-argument -- TanStack Router params are typed via route tree generation
  const { data: counts } = useDeckCounts(deckId);
  const navigate = useNavigate();

  // oxlint-disable-next-line typescript/no-unsafe-argument -- TanStack Router params are typed via route tree generation
  const deck = decks ? findDeck(decks, deckId) : undefined;
  const allDecks = useMemo(
    () => (decks ? flattenDecks(decks) : EMPTY_DECKS),
    [decks],
  );

  if (decksLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading deck...</p>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Deck not found.
        </div>
        <Link to="/">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <DeckSettingsContent
      deck={deck}
      allDecks={allDecks}
      counts={counts}
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- TanStack Router params are typed via route tree generation
      deckId={deckId}
      navigate={navigate}
    />
  );
}

function DeckSettingsContent({
  deck,
  allDecks,
  counts,
  deckId,
  navigate,
}: {
  deck: DeckData;
  allDecks: DeckTreeNode[];
  counts: { new: number; learning: number; review: number } | undefined;
  deckId: string;
  navigate: ReturnType<typeof useNavigate>;
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
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset form when deck changes
  useEffect(() => {
    setName(deck.name);
    setDescription(deck.description ?? "");
    setParentId(deck.parentId ?? "");
    setNewCardsPerDay(String(deck.settings?.newCardsPerDay ?? 20));
    setMaxReviewsPerDay(String(deck.settings?.maxReviewsPerDay ?? 200));
  }, [deck]);

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          parentId: parentId || undefined,
          settings: {
            newCardsPerDay: Number(newCardsPerDay) || 20,
            maxReviewsPerDay: Number(maxReviewsPerDay) || 200,
          },
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to update deck");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete deck");
      }
      void navigate({ to: "/" });
    } catch {
      setIsDeleting(false);
    }
  }

  // Filter out the current deck and its descendants from parent options
  const parentOptions = allDecks.filter((d) => d.id !== deckId);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link to="/">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <h1 className="text-sm font-medium">Deck Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="grid gap-6">
          {/* Stats Summary */}
          <DeckStatsSummary counts={counts} />

          {/* Deck Info */}
          <Card>
            <CardHeader>
              <CardTitle>Deck Information</CardTitle>
              <CardDescription>Basic settings for this deck.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="deck-name">Name</Label>
                  <Input
                    id="deck-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="deck-description">Description</Label>
                  <textarea
                    id="deck-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                    className="h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="parent-deck">Parent Deck</Label>
                  <select
                    id="parent-deck"
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
              </div>
            </CardContent>
          </Card>

          {/* Study Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Study Settings</CardTitle>
              <CardDescription>
                Control how many cards appear in each study session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="deck-new-cards">New Cards per Day</Label>
                  <Input
                    id="deck-new-cards"
                    type="number"
                    min="0"
                    max="9999"
                    value={newCardsPerDay}
                    onChange={(e) => setNewCardsPerDay(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="deck-max-reviews">Max Reviews per Day</Label>
                  <Input
                    id="deck-max-reviews"
                    type="number"
                    min="0"
                    max="9999"
                    value={maxReviewsPerDay}
                    onChange={(e) => setMaxReviewsPerDay(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save button */}
          <div className="flex justify-end">
            <Button
              onClick={() => void handleSave()}
              disabled={!name.trim() || isSaving}
            >
              {(() => {
                if (saved) {
                  return "Saved";
                }
                if (isSaving) {
                  return "Saving...";
                }
                return "Save Changes";
              })()}
            </Button>
          </div>

          <Separator />

          {/* Delete */}
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Delete Deck</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete this deck. Child decks will be
                    re-parented.
                  </p>
                </div>
                <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <DialogTrigger
                    render={
                      <Button variant="destructive">
                        <Trash2 className="size-4" data-icon="inline-start" />
                        Delete Deck
                      </Button>
                    }
                  />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Deck</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete &quot;{deck.name}&quot;?
                        This action cannot be undone. Child decks will be moved
                        to the parent deck.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={() => void handleDelete()}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting..." : "Delete Deck"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

/* ---------- Stats Summary ---------- */

function DeckStatsSummary({
  counts,
}: {
  counts: { new: number; learning: number; review: number } | undefined;
}): React.ReactElement {
  const { data: reviews } = useReviewsPerDay(7);

  const totalReviewsLast7Days = reviews
    ? reviews.reduce((sum, r) => sum + r.count, 0)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deck Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-500">
              {counts?.new ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">New</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-500">
              {counts?.learning ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Learning</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-500">
              {counts?.review ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Due for Review</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{totalReviewsLast7Days}</p>
            <p className="text-xs text-muted-foreground">Reviews (7d)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
