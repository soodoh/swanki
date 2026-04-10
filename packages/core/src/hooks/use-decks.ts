import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTransport } from "../transport";

export type DeckTreeNode = {
	id: string;
	userId: string;
	name: string;
	parentId: string | undefined;
	description: string;
	settings: { newCardsPerDay: number; maxReviewsPerDay: number } | undefined;
	createdAt: string;
	updatedAt: string;
	children: DeckTreeNode[];
};

export type CardCounts = {
	new: number;
	learning: number;
	review: number;
};

export function useDecks(): UseQueryResult<DeckTreeNode[]> {
	const transport = useTransport();

	return useQuery<DeckTreeNode[]>({
		queryKey: ["decks"],
		queryFn: () => transport.query<DeckTreeNode[]>("/api/decks"),
	});
}

export function useCreateDeck(): UseMutationResult<
	DeckTreeNode | undefined,
	Error,
	{ name: string; parentId?: string }
> {
	const transport = useTransport();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: { name: string; parentId?: string }) =>
			transport.mutate<DeckTreeNode | undefined>("/api/decks", "POST", data),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["decks"] });
		},
	});
}

export function useDeckCounts(
	deckId: string | undefined,
): UseQueryResult<CardCounts> {
	const transport = useTransport();

	return useQuery<CardCounts>({
		queryKey: ["deck-counts", deckId],
		queryFn: () =>
			transport.query<CardCounts>("/api/cards", {
				deckId: String(deckId),
				counts: "true",
			}),
		enabled: deckId !== undefined,
	});
}

export type DeckUpdatePayload = {
	deckId: string;
	name?: string;
	description?: string;
	parentId?: string | null | undefined;
	settings?: { newCardsPerDay: number; maxReviewsPerDay: number };
};

export function useUpdateDeck(): UseMutationResult<
	void,
	Error,
	DeckUpdatePayload
> {
	const transport = useTransport();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ deckId, ...data }: DeckUpdatePayload) =>
			transport.mutate<void>(`/api/decks/${deckId}`, "PUT", data),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["decks"] });
		},
	});
}

export function useDeleteDeck(): UseMutationResult<void, Error, string> {
	const transport = useTransport();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (deckId: string) =>
			transport.mutate<void>(`/api/decks/${deckId}`, "DELETE"),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["decks"] });
			void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
		},
	});
}
