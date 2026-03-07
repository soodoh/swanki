import { useState, useCallback, useEffect } from "react";
import { Save, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCardDetail, useUpdateCard } from "@/lib/hooks/use-browse";
import { useDecks } from "@/lib/hooks/use-decks";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";

type CardDetailPanelProps = {
  cardId: string | undefined;
};

const STATE_LABELS: Record<number, string> = {
  0: "New",
  1: "Learning",
  2: "Review",
  3: "Relearning",
};

const RATING_LABELS: Record<number, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

function flattenDecks(nodes: DeckTreeNode[]): { id: string; name: string }[] {
  const result: { id: string; name: string }[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name });
    if (node.children.length > 0) {
      result.push(...flattenDecks(node.children));
    }
  }
  return result;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeTaken(ms: number | undefined): string {
  if (ms === undefined) {
    return "-";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function CardDetailPanel({
  cardId,
}: CardDetailPanelProps): React.ReactElement {
  const { data: detail, isLoading } = useCardDetail(cardId);
  const { data: decks } = useDecks();
  const updateCard = useUpdateCard();

  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");

  const flatDecks = decks ? flattenDecks(decks) : [];

  // Reset edit fields when card changes
  useEffect(() => {
    if (detail) {
      setEditFields(
        typeof detail.note.fields === "string"
          ? (JSON.parse(detail.note.fields) as Record<string, string>)
          : detail.note.fields,
      );
      setSelectedDeckId(detail.card.deckId);
    }
  }, [detail]);

  const handleFieldChange = useCallback((fieldName: string, value: string) => {
    setEditFields((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!cardId) {
      return;
    }

    await updateCard.mutateAsync({
      cardId,
      fields: editFields,
      deckId: selectedDeckId || undefined,
    });
  }, [cardId, editFields, selectedDeckId, updateCard]);

  if (!cardId) {
    return (
      <div className="flex h-full w-72 shrink-0 items-center justify-center border-l pl-4">
        <p className="text-sm text-muted-foreground">
          Select a card to view details
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full w-72 shrink-0 items-center justify-center border-l pl-4">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full w-72 shrink-0 items-center justify-center border-l pl-4">
        <p className="text-sm text-muted-foreground">Card not found</p>
      </div>
    );
  }

  const noteFieldNames: string[] =
    typeof detail.noteType.fields === "string"
      ? (JSON.parse(detail.noteType.fields) as string[])
      : [];

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l pl-4">
      <ScrollArea className="flex-1">
        <div className="space-y-4 pr-2">
          {/* Card info */}
          <div>
            <h3 className="text-sm font-semibold">Card Info</h3>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Type:</span>{" "}
                {detail.noteType.name}
              </p>
              <p>
                <span className="font-medium text-foreground">State:</span>{" "}
                {STATE_LABELS[detail.card.state ?? 0] ?? "Unknown"}
              </p>
              <p>
                <span className="font-medium text-foreground">Reps:</span>{" "}
                {detail.card.reps ?? 0}
              </p>
              <p>
                <span className="font-medium text-foreground">Lapses:</span>{" "}
                {detail.card.lapses ?? 0}
              </p>
              {detail.card.due && (
                <p>
                  <span className="font-medium text-foreground">Due:</span>{" "}
                  {formatDate(detail.card.due)}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Edit fields */}
          <div>
            <h3 className="text-sm font-semibold">Fields</h3>
            <div className="mt-2 space-y-3">
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
                </div>
              ))}
              {/* Fallback if no field names available */}
              {noteFieldNames.length === 0 &&
                Object.entries(editFields).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{key}</Label>
                    <Input
                      value={value}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      className="text-xs"
                    />
                  </div>
                ))}
            </div>
          </div>

          <Separator />

          {/* Deck selector */}
          <div className="space-y-1">
            <Label className="text-xs">Deck</Label>
            <Select value={selectedDeckId} onValueChange={setSelectedDeckId}>
              <SelectTrigger className="w-full text-xs">
                <SelectValue placeholder="Select deck" />
              </SelectTrigger>
              <SelectContent>
                {flatDecks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>
                    {deck.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Save button */}
          <Button
            size="sm"
            className="w-full"
            onClick={handleSave}
            disabled={updateCard.isPending}
          >
            <Save className="size-3.5" data-icon="inline-start" />
            {updateCard.isPending ? "Saving..." : "Save Changes"}
          </Button>

          <Separator />

          {/* Review history */}
          <div>
            <h3 className="text-sm font-semibold">Review History</h3>
            {detail.recentReviews.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No reviews yet
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {detail.recentReviews.map((review) => (
                  <div
                    key={review.id}
                    className="flex items-start gap-2 text-xs"
                  >
                    <Clock className="mt-0.5 size-3 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">
                          {RATING_LABELS[review.rating] ??
                            `Rating ${review.rating}`}
                        </Badge>
                        <span className="text-muted-foreground">
                          {formatTimeTaken(review.timeTakenMs)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground">
                        {formatDate(review.reviewedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
