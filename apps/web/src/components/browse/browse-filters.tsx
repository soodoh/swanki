import { useCallback, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import type { BrowseNote } from "@/lib/hooks/use-browse";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";
import { useDecks } from "@/lib/hooks/use-decks";
import { useNoteTypes } from "@/lib/hooks/use-note-types";

type BrowseFiltersProps = {
	searchQuery: string;
	onSearchChange: (query: string) => void;
	notes: BrowseNote[] | undefined;
};

function flattenDecks(
	nodes: DeckTreeNode[],
): Array<{ id: string; name: string }> {
	const result: Array<{ id: string; name: string }> = [];
	for (const node of nodes) {
		result.push({ id: node.id, name: node.name });
		if (node.children.length > 0) {
			result.push(...flattenDecks(node.children));
		}
	}
	return result;
}

function extractTags(notes: BrowseNote[] | undefined): string[] {
	if (!notes) {
		return [];
	}

	const tagSet = new Set<string>();
	for (const note of notes) {
		if (note.tags) {
			for (const tag of note.tags.split(" ")) {
				const trimmed = tag.trim();
				if (trimmed) {
					tagSet.add(trimmed);
				}
			}
		}
	}
	const tags: string[] = [...tagSet];
	tags.sort();
	return tags;
}

function collapseWhitespace(str: string): string {
	return str.split(/\s+/).filter(Boolean).join(" ").trim();
}

function escapeRegExp(str: string): string {
	// oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-unsafe-call -- replaceAll with regex is correctly typed
	return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** Match a filter token with word boundaries (not as a substring of a longer token). */
function filterRegex(filterStr: string): RegExp {
	return new RegExp(`(?:^|\\s)${escapeRegExp(filterStr)}(?=\\s|$)`, "g");
}

function hasFilter(query: string, prefix: string, value: string): boolean {
	const unquoted = `${prefix}:${value}`;
	const quoted = `${prefix}:"${value}"`;
	return filterRegex(unquoted).test(query) || filterRegex(quoted).test(query);
}

function removeFilter(query: string, filterStr: string): string {
	return collapseWhitespace(query.replace(filterRegex(filterStr), " "));
}

function toggleFilter(query: string, prefix: string, value: string): string {
	const needsQuotes = value.includes(" ");
	const filterStr = needsQuotes ? `${prefix}:"${value}"` : `${prefix}:${value}`;

	if (hasFilter(query, prefix, value)) {
		return removeFilter(query, filterStr);
	}

	return query ? `${query} ${filterStr}` : filterStr;
}

export function BrowseFilters({
	searchQuery,
	onSearchChange,
	notes,
}: BrowseFiltersProps): React.ReactElement {
	const { data: decks } = useDecks();
	const { data: noteTypesData } = useNoteTypes();
	const flatDecks = useMemo(() => (decks ? flattenDecks(decks) : []), [decks]);
	const tags = useMemo(() => extractTags(notes), [notes]);

	// Determine current deck filter
	const currentDeck = useMemo(() => {
		for (const deck of flatDecks) {
			if (hasFilter(searchQuery, "deck", deck.name)) {
				return deck.name;
			}
		}
		return "__all__";
	}, [searchQuery, flatDecks]);

	const handleDeckChange = useCallback(
		(deckName: string) => {
			let cleaned = searchQuery;
			for (const deck of flatDecks) {
				const needsQuotes = deck.name.includes(" ");
				const filterStr = needsQuotes
					? `deck:"${deck.name}"`
					: `deck:${deck.name}`;
				cleaned = removeFilter(cleaned, filterStr);
			}

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

	// Determine current note type filter
	const currentNoteType = useMemo(() => {
		if (!noteTypesData) {
			return "__all__";
		}
		for (const nt of noteTypesData) {
			if (hasFilter(searchQuery, "notetype", nt.noteType.name)) {
				return nt.noteType.name;
			}
		}
		return "__all__";
	}, [searchQuery, noteTypesData]);

	const handleNoteTypeChange = useCallback(
		(noteTypeName: string) => {
			let cleaned = searchQuery;
			if (noteTypesData) {
				for (const nt of noteTypesData) {
					const name = nt.noteType.name;
					const needsQuotes = name.includes(" ");
					const filterStr = needsQuotes
						? `notetype:"${name}"`
						: `notetype:${name}`;
					cleaned = removeFilter(cleaned, filterStr);
				}
			}

			if (noteTypeName === "__all__") {
				onSearchChange(cleaned);
			} else {
				const needsQuotes = noteTypeName.includes(" ");
				const filterStr = needsQuotes
					? `notetype:"${noteTypeName}"`
					: `notetype:${noteTypeName}`;
				onSearchChange(cleaned ? `${cleaned} ${filterStr}` : filterStr);
			}
		},
		[searchQuery, noteTypesData, onSearchChange],
	);

	// State toggles
	const handleStateToggle = useCallback(
		(state: string) => {
			onSearchChange(toggleFilter(searchQuery, "is", state));
		},
		[searchQuery, onSearchChange],
	);

	// Tag toggles
	const handleTagClick = useCallback(
		(tag: string) => {
			onSearchChange(toggleFilter(searchQuery, "tag", tag));
		},
		[searchQuery, onSearchChange],
	);

	const deckLabel = currentDeck === "__all__" ? "All Decks" : currentDeck;
	const noteTypeLabel =
		currentNoteType === "__all__" ? "All Types" : currentNoteType;

	return (
		<div className="flex flex-wrap items-center gap-2 pt-3">
			{/* Deck select */}
			<Select value={currentDeck} onValueChange={handleDeckChange}>
				<SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
					<span className="truncate">{deckLabel}</span>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="__all__">All Decks</SelectItem>
					{flatDecks.map((deck) => (
						<SelectItem key={deck.id} value={deck.name}>
							{deck.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{/* Note Type select */}
			<Select value={currentNoteType} onValueChange={handleNoteTypeChange}>
				<SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
					<span className="truncate">{noteTypeLabel}</span>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="__all__">All Types</SelectItem>
					{noteTypesData?.map((nt) => (
						<SelectItem key={nt.noteType.id} value={nt.noteType.name}>
							{nt.noteType.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{/* Separator */}
			{(flatDecks.length > 0 || noteTypesData) && (
				<div className="mx-0.5 h-5 w-px bg-border" />
			)}

			{/* State toggle buttons */}
			{["new", "review", "due"].map((state) => (
				<Button
					key={state}
					variant={hasFilter(searchQuery, "is", state) ? "default" : "outline"}
					size="sm"
					className="h-7 px-2.5 text-xs capitalize"
					onClick={() => handleStateToggle(state)}
				>
					{state}
				</Button>
			))}

			{/* Tag badges */}
			{tags.length > 0 && <div className="mx-0.5 h-5 w-px bg-border" />}
			{tags.map((tag) => (
				<Badge
					key={tag}
					variant={hasFilter(searchQuery, "tag", tag) ? "default" : "outline"}
					className="cursor-pointer text-xs"
					onClick={() => handleTagClick(tag)}
				>
					{tag}
				</Badge>
			))}
		</div>
	);
}
