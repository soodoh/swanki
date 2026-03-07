import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback } from "react";

import { SearchBar } from "@/components/browse/search-bar";
import { FilterSidebar } from "@/components/browse/filter-sidebar";
import { CardTable } from "@/components/browse/card-table";
import { CardDetailPanel } from "@/components/browse/card-detail";
import { useBrowse } from "@/lib/hooks/use-browse";
import type { BrowseOptions } from "@/lib/hooks/use-browse";

type BrowseSearch = {
  q?: string;
  page?: number;
};

export const Route = createFileRoute("/_authenticated/browse")({
  validateSearch: (search: Record<string, unknown>): BrowseSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    page:
      typeof search.page === "number" && search.page > 0
        ? search.page
        : undefined,
  }),
  component: BrowsePage,
});

function BrowsePage(): React.ReactElement {
  const navigate = useNavigate({ from: "/browse" });
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- typed via validateSearch
  const { q = "", page = 1 } = Route.useSearch();
  const typedQ = q as string;
  const typedPage = page as number;

  const [searchInput, setSearchInput] = useState<string>(typedQ);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(
    undefined,
  );
  const [sortBy, setSortBy] = useState<BrowseOptions["sortBy"]>(undefined);
  const [sortDir, setSortDir] = useState<BrowseOptions["sortDir"]>(undefined);

  const { data, isLoading } = useBrowse(typedQ, {
    page: typedPage,
    sortBy,
    sortDir,
  });

  const handleSearchSubmit = useCallback(
    (value: string) => {
      void navigate({
        search: { q: value || undefined, page: undefined },
      });
      setSelectedCardId(undefined);
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
        search: { q: query || undefined, page: undefined },
      });
      setSelectedCardId(undefined);
    },
    [navigate],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      void navigate({
        search: {
          q: typedQ || undefined,
          page: newPage > 1 ? newPage : undefined,
        },
      });
    },
    [navigate, typedQ],
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

  const handleSelectCard = useCallback((cardId: string) => {
    setSelectedCardId((prev) => (prev === cardId ? undefined : cardId));
  }, []);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Search bar */}
      <div className="shrink-0 border-b p-4">
        <SearchBar
          value={searchInput}
          onChange={handleSearchChange}
          onSubmit={handleSearchSubmit}
        />
      </div>

      {/* Three-panel layout */}
      <div className="flex min-h-0 flex-1 gap-0 p-4">
        {/* Filter sidebar */}
        <FilterSidebar
          searchQuery={typedQ}
          onSearchChange={handleFilterChange}
          cards={data?.cards}
        />

        {/* Card table */}
        <div className="flex min-w-0 flex-1 flex-col px-4">
          <CardTable
            cards={data?.cards}
            total={data?.total ?? 0}
            page={data?.page ?? typedPage}
            limit={data?.limit ?? 50}
            selectedCardId={selectedCardId}
            onSelectCard={handleSelectCard}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            onPageChange={handlePageChange}
            isLoading={isLoading}
          />
        </div>

        {/* Card detail panel */}
        <CardDetailPanel cardId={selectedCardId} />
      </div>
    </div>
  );
}
