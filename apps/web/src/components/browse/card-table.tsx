import { useCallback, useMemo } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BrowseCard, BrowseOptions } from "@/lib/hooks/use-browse";

type CardTableProps = {
  cards: BrowseCard[] | undefined;
  total: number;
  page: number;
  limit: number;
  selectedCardId: string | undefined;
  onSelectCard: (cardId: string) => void;
  sortBy: BrowseOptions["sortBy"];
  sortDir: BrowseOptions["sortDir"];
  onSortChange: (
    sortBy: BrowseOptions["sortBy"],
    sortDir: BrowseOptions["sortDir"],
  ) => void;
  onPageChange: (page: number) => void;
  isLoading: boolean;
};

const STATE_LABELS: Record<number, string> = {
  0: "New",
  1: "Learning",
  2: "Review",
  3: "Relearning",
};

const STATE_VARIANTS: Record<number, "default" | "secondary" | "outline"> = {
  0: "default",
  1: "secondary",
  2: "outline",
  3: "secondary",
};

function getQuestionPreview(fields: Record<string, string>): string {
  const firstValue = Object.values(fields)[0];
  if (!firstValue) {
    return "(empty)";
  }
  // Strip HTML tags for preview
  // oxlint-disable-next-line eslint-plugin-unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference
  const text: string = firstValue.replace(/<[^>]*>/g, "");
  return text.length > 60 ? `${text.slice(0, 60)}...` : text;
}

function formatDue(due: string): string {
  const dueDate = new Date(due);
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `${Math.abs(diffDays)}d overdue`;
  }
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Tomorrow";
  }
  return `${diffDays}d`;
}

function formatInterval(scheduledDays: number | undefined): string {
  if (scheduledDays === undefined || scheduledDays === 0) {
    return "-";
  }
  if (scheduledDays < 30) {
    return `${scheduledDays}d`;
  }
  if (scheduledDays < 365) {
    return `${Math.round(scheduledDays / 30)}mo`;
  }
  return `${(scheduledDays / 365).toFixed(1)}y`;
}

export function CardTable({
  cards,
  total,
  page,
  limit,
  selectedCardId,
  onSelectCard,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
  isLoading,
}: CardTableProps): React.ReactElement {
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / limit)),
    [total, limit],
  );

  const handleSort = useCallback(
    (column: BrowseOptions["sortBy"]) => {
      if (sortBy === column) {
        onSortChange(column, sortDir === "asc" ? "desc" : "asc");
      } else {
        onSortChange(column, "asc");
      }
    },
    [sortBy, sortDir, onSortChange],
  );

  const renderSortButton = useCallback(
    (label: string, column: BrowseOptions["sortBy"]) => (
      <Button
        variant="ghost"
        size="xs"
        className="gap-1 px-0 font-medium hover:bg-transparent"
        onClick={() => handleSort(column)}
      >
        {label}
        <ArrowUpDown className="size-3" />
      </Button>
    ),
    [handleSort],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading cards...</p>
      </div>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No cards found. Try adjusting your search.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Question</TableHead>
              <TableHead className="w-[120px]">Deck</TableHead>
              <TableHead className="w-[100px]">
                {renderSortButton("Due", "due")}
              </TableHead>
              <TableHead className="w-[80px]">Interval</TableHead>
              <TableHead className="w-[90px]">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((card) => (
              <TableRow
                key={card.id}
                className={`cursor-pointer ${
                  selectedCardId === card.id ? "bg-muted" : ""
                }`}
                onClick={() => onSelectCard(card.id)}
                data-state={selectedCardId === card.id ? "selected" : undefined}
              >
                <TableCell className="font-medium">
                  {getQuestionPreview(card.noteFields)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {card.deckName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDue(card.due)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatInterval(card.scheduledDays)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATE_VARIANTS[card.state ?? 0] ?? "outline"}>
                    {STATE_LABELS[card.state ?? 0] ?? "Unknown"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t px-2 py-2">
        <p className="text-xs text-muted-foreground">
          {total} card{total === 1 ? "" : "s"} found
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="px-2 text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
