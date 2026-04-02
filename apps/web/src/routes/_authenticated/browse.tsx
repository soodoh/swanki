import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { BrowseFilters } from "@/components/browse/browse-filters";
import { NoteEditorDialog } from "@/components/browse/note-editor-dialog";
import { NoteTable } from "@/components/browse/note-table";
import { SearchBar } from "@/components/browse/search-bar";
import type { BrowseOptions } from "@/lib/hooks/use-browse";
import { useBrowse } from "@/lib/hooks/use-browse";

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

export function BrowsePage(): React.ReactElement {
	const navigate = useNavigate({ from: "/browse" });
	// oxlint-disable-next-line typescript/no-unsafe-assignment -- typed via validateSearch
	const { q = "", page = 1 } = Route.useSearch();
	const typedQ = q as string;
	const typedPage = page as number;

	const [searchInput, setSearchInput] = useState<string>(typedQ);
	const [selectedNoteId, setSelectedNoteId] = useState<number | undefined>(
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
				search: { q: query || undefined, page: undefined },
			});
			setSelectedNoteId(undefined);
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
					searchQuery={typedQ}
					onSearchChange={handleFilterChange}
					notes={data?.notes}
				/>
			</div>

			{/* Note table — full width, no sidebar */}
			<div className="min-h-0 flex-1 p-4">
				<NoteTable
					notes={data?.notes}
					total={data?.total ?? 0}
					page={data?.page ?? typedPage}
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
					suspended={
						data?.notes.find((n) => n.noteId === selectedNoteId)?.suspended ??
						false
					}
				/>
			)}
		</div>
	);
}
