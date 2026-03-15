import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useCallback } from "react";

import { SearchBar } from "@/components/browse/search-bar";
import { BrowseFilters } from "@/components/browse/browse-filters";
import { NoteTable } from "@/components/browse/note-table";
import { NoteEditorDialog } from "@/components/browse/note-editor-dialog";
import { useBrowse } from "@/lib/hooks/use-browse";
import type { BrowseOptions } from "@/lib/hooks/use-browse";

export function DesktopBrowsePage(): React.ReactElement {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    q?: string;
    page?: number;
  };
  const q = search.q ?? "";
  const page = search.page ?? 1;

  const [searchInput, setSearchInput] = useState<string>(q);
  const [selectedNoteId, setSelectedNoteId] = useState<number | undefined>(
    undefined,
  );
  const [sortBy, setSortBy] = useState<BrowseOptions["sortBy"]>(undefined);
  const [sortDir, setSortDir] = useState<BrowseOptions["sortDir"]>(undefined);

  const { data, isLoading } = useBrowse(q, {
    page,
    sortBy,
    sortDir,
  });

  const handleSearchSubmit = useCallback(
    (value: string) => {
      void navigate({
        to: "/browse",
        search: { q: value || undefined, page: undefined },
      });
      setSelectedNoteId(undefined);
    },
    [navigate],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  const handleFilterChange = useCallback(
    (query: string) => {
      setSearchInput(query);
      void navigate({
        to: "/browse",
        search: { q: query || undefined, page: undefined },
      });
      setSelectedNoteId(undefined);
    },
    [navigate],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      void navigate({
        to: "/browse",
        search: {
          q: q || undefined,
          page: newPage > 1 ? newPage : undefined,
        },
      });
    },
    [navigate, q],
  );

  const handleSortChange = useCallback(
    (
      newSortBy: BrowseOptions["sortBy"],
      newSortDir: BrowseOptions["sortDir"],
    ) => {
      setSortBy(newSortBy);
      setSortDir(newSortDir);
    },
    [],
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Search bar + filters */}
      <div className="shrink-0 border-b p-4">
        <SearchBar
          value={searchInput}
          onChange={handleSearchChange}
          onSubmit={handleSearchSubmit}
        />
        <BrowseFilters
          searchQuery={q}
          onSearchChange={handleFilterChange}
          notes={data?.notes}
        />
      </div>

      {/* Note table */}
      <div className="min-h-0 flex-1 p-4">
        <NoteTable
          notes={data?.notes}
          total={data?.total ?? 0}
          page={data?.page ?? page}
          limit={data?.limit ?? 50}
          selectedNoteId={selectedNoteId}
          onSelectNote={setSelectedNoteId}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
          isLoading={isLoading}
        />
      </div>

      {/* Note editor modal */}
      {selectedNoteId && (
        <NoteEditorDialog
          noteId={selectedNoteId}
          open={Boolean(selectedNoteId)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedNoteId(undefined);
            }
          }}
        />
      )}
    </div>
  );
}
