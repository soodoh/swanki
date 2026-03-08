import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";

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
  return useQuery<DeckTreeNode[]>({
    queryKey: ["decks"],
    queryFn: async () => {
      const res = await fetch("/api/decks");
      if (!res.ok) {
        throw new Error("Failed to fetch decks");
      }
      return res.json() as Promise<DeckTreeNode[]>;
    },
  });
}

export function useCreateDeck(): UseMutationResult<
  DeckTreeNode,
  Error,
  { name: string; parentId?: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; parentId?: string }) => {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to create deck");
      }
      return res.json() as Promise<DeckTreeNode>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export function useDeckCounts(
  deckId: string | undefined,
): UseQueryResult<CardCounts> {
  return useQuery<CardCounts>({
    queryKey: ["deck-counts", deckId],
    queryFn: async () => {
      const res = await fetch(`/api/cards?deckId=${deckId}&counts=true`);
      if (!res.ok) {
        throw new Error("Failed to fetch deck counts");
      }
      return res.json() as Promise<CardCounts>;
    },
    enabled: Boolean(deckId),
  });
}

export function useRenameDeck(): UseMutationResult<
  void,
  Error,
  { deckId: string; name: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { deckId: string; name: string }) => {
      const res = await fetch(`/api/decks/${data.deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name }),
      });
      if (!res.ok) {
        throw new Error("Failed to rename deck");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export function useDeleteDeck(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deckId: string) => {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete deck");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
    },
  });
}
