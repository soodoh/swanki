import { useCallback, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDecks } from "@/lib/hooks/use-decks";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";
import type { BrowseCard } from "@/lib/hooks/use-browse";

type FilterSidebarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  cards: BrowseCard[] | undefined;
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

function extractTags(cards: BrowseCard[] | undefined): string[] {
  if (!cards) {
    return [];
  }

  const tagSet = new Set<string>();
  for (const card of cards) {
    if (card.noteTags) {
      for (const tag of card.noteTags.split(" ")) {
        const trimmed = tag.trim();
        if (trimmed) {
          tagSet.add(trimmed);
        }
      }
    }
  }
  return [...tagSet].sort();
}

function hasFilter(query: string, prefix: string, value: string): boolean {
  return (
    query.includes(`${prefix}:${value}`) ||
    query.includes(`${prefix}:"${value}"`)
  );
}

function toggleFilter(query: string, prefix: string, value: string): string {
  const needsQuotes = value.includes(" ");
  const filterStr = needsQuotes ? `${prefix}:"${value}"` : `${prefix}:${value}`;

  if (hasFilter(query, prefix, value)) {
    // Remove the filter
    return query
      .replace(filterStr, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // Add the filter
  return query ? `${query} ${filterStr}` : filterStr;
}

export function FilterSidebar({
  searchQuery,
  onSearchChange,
  cards,
}: FilterSidebarProps): React.ReactElement {
  const { data: decks } = useDecks();
  const flatDecks = useMemo(() => (decks ? flattenDecks(decks) : []), [decks]);
  const tags = useMemo(() => extractTags(cards), [cards]);

  const handleDeckChange = useCallback(
    (deckName: string) => {
      // Remove any existing deck filter first
      let cleaned = searchQuery;
      for (const deck of flatDecks) {
        const needsQuotes = deck.name.includes(" ");
        const filterStr = needsQuotes
          ? `deck:"${deck.name}"`
          : `deck:${deck.name}`;
        cleaned = cleaned.replace(filterStr, "");
      }
      cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

      if (deckName === "__all__") {
        onSearchChange(cleaned);
      } else {
        const needsQuotes = deckName.includes(" ");
        const filterStr = needsQuotes
          ? `deck:"${deckName}"`
          : `deck:${deckName}`;
        onSearchChange(cleaned ? `${cleaned} ${filterStr}` : filterStr);
      }
    },
    [searchQuery, flatDecks, onSearchChange],
  );

  const handleStateToggle = useCallback(
    (state: string) => {
      onSearchChange(toggleFilter(searchQuery, "is", state));
    },
    [searchQuery, onSearchChange],
  );

  const handleTagClick = useCallback(
    (tag: string) => {
      onSearchChange(toggleFilter(searchQuery, "tag", tag));
    },
    [searchQuery, onSearchChange],
  );

  // Determine current deck filter
  const currentDeck = useMemo(() => {
    for (const deck of flatDecks) {
      if (hasFilter(searchQuery, "deck", deck.name)) {
        return deck.name;
      }
    }
    return "__all__";
  }, [searchQuery, flatDecks]);

  return (
    <div className="flex h-full w-56 shrink-0 flex-col gap-4 border-r pr-4">
      {/* Deck filter */}
      <div className="space-y-2">
        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Deck
        </Label>
        <Select value={currentDeck} onValueChange={handleDeckChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All decks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All decks</SelectItem>
            {flatDecks.map((deck) => (
              <SelectItem key={deck.id} value={deck.name}>
                {deck.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Card state */}
      <div className="space-y-2">
        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Card State
        </Label>
        <div className="space-y-2">
          {["new", "review", "due"].map((state) => (
            <label
              key={state}
              className="flex cursor-pointer items-center gap-2"
            >
              <Checkbox
                checked={hasFilter(searchQuery, "is", state)}
                onCheckedChange={() => handleStateToggle(state)}
              />
              <span className="text-sm capitalize">{state}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Tags
        </Label>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tags found</p>
        ) : (
          <ScrollArea className="flex-1">
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant={
                    hasFilter(searchQuery, "tag", tag) ? "default" : "outline"
                  }
                  className="cursor-pointer text-xs"
                  onClick={() => handleTagClick(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
