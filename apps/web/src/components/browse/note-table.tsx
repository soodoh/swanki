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
import type { BrowseNote, BrowseOptions } from "@/lib/hooks/use-browse";

type NoteTableProps = {
  notes: BrowseNote[] | undefined;
  total: number;
  page: number;
  limit: number;
  selectedNoteId: number | undefined;
  onSelectNote: (noteId: number) => void;
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
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function formatDue(due: string | undefined): string {
  if (!due) {
    return "-";
  }
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

export function NoteTable({
  notes,
  total,
  page,
  limit,
  selectedNoteId,
  onSelectNote,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
  isLoading,
}: NoteTableProps): React.ReactElement {
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
        <p className="text-sm text-muted-foreground">Loading notes...</p>
      </div>
    );
  }

  if (!notes || notes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No notes found. Try adjusting your search.
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
              <TableHead className="min-w-[200px]">Preview</TableHead>
              <TableHead className="w-[120px]">Deck</TableHead>
              <TableHead className="w-[60px]">Cards</TableHead>
              <TableHead className="w-[100px]">
                {renderSortButton("Due", "due")}
              </TableHead>
              <TableHead className="w-[120px]">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notes.map((note) => (
              <TableRow
                key={note.noteId}
                className={`cursor-pointer ${
                  selectedNoteId === note.noteId ? "bg-muted" : ""
                }`}
                onClick={() => onSelectNote(note.noteId)}
                data-state={
                  selectedNoteId === note.noteId ? "selected" : undefined
                }
              >
                <TableCell className="font-medium">
                  {getQuestionPreview(note.fields)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {note.deckName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {note.cardCount}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDue(note.earliestDue)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {note.states.map((s) => (
                      <Badge key={s} variant={STATE_VARIANTS[s] ?? "outline"}>
                        {STATE_LABELS[s] ?? "Unknown"}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t px-2 py-2">
        <p className="text-xs text-muted-foreground">
          {total} note{total === 1 ? "" : "s"} found
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
