import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { useOffline } from "@/lib/offline/offline-provider";
import { offlineQuery, offlineMutation } from "@/lib/offline/offline-fetch";
import * as localQueries from "@/lib/offline/local-queries";
import * as localMutations from "@/lib/offline/local-mutations";
import { decks as decksTable } from "@/db/schema";

export type DeckTreeNode = {
  id: number;
  userId: string;
  name: string;
  parentId: number | undefined;
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
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<DeckTreeNode[]>({
    queryKey: ["decks"],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch("/api/decks");
          if (!res.ok) {
            throw new Error("Failed to fetch decks");
          }
          return res.json() as Promise<DeckTreeNode[]>;
        },
        localQuery: (localDb) => localQueries.getDecksTree(localDb),
        db,
        isOnline,
        isLocalReady,
      }),
  });
}

export function useCreateDeck(): UseMutationResult<
  DeckTreeNode | undefined,
  Error,
  { name: string; parentId?: number }
> {
  const queryClient = useQueryClient();
  const { db, isOnline, queue, persist } = useOffline();

  return useMutation({
    mutationFn: async (data: { name: string; parentId?: number }) =>
      offlineMutation(
        {
          serverFetch: async (input) => {
            const res = await fetch("/api/decks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            });
            if (!res.ok) {
              throw new Error("Failed to create deck");
            }
            return res.json() as Promise<DeckTreeNode>;
          },
          localMutation: (localDb, input) => {
            const id = crypto.randomUUID();
            const row = localDb
              .select({ userId: decksTable.userId })
              .from(decksTable)
              .limit(1)
              .get();
            const userId = row?.userId ?? "";
            localMutations.createDeck(localDb, {
              id,
              userId,
              name: input.name,
              parentId: input.parentId,
            });
          },
          queueEntry: (input) => ({
            endpoint: "/api/decks",
            method: "POST",
            body: input,
          }),
          db,
          isOnline,
          queue,
          persist,
        },
        data,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export function useDeckCounts(
  deckId: number | undefined,
): UseQueryResult<CardCounts> {
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<CardCounts>({
    queryKey: ["deck-counts", deckId],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch(`/api/cards?deckId=${deckId}&counts=true`);
          if (!res.ok) {
            throw new Error("Failed to fetch deck counts");
          }
          return res.json() as Promise<CardCounts>;
        },
        localQuery: (localDb) =>
          deckId ? localQueries.getDeckCounts(localDb, deckId) : undefined,
        db,
        isOnline,
        isLocalReady,
      }),
    enabled: deckId !== undefined,
  });
}

export type DeckUpdatePayload = {
  deckId: number;
  name?: string;
  description?: string;
  parentId?: number | undefined;
  settings?: { newCardsPerDay: number; maxReviewsPerDay: number };
};

export function useUpdateDeck(): UseMutationResult<
  void,
  Error,
  DeckUpdatePayload
> {
  const queryClient = useQueryClient();
  const { db, isOnline, queue, persist } = useOffline();

  return useMutation({
    mutationFn: async ({ deckId, ...data }: DeckUpdatePayload) =>
      offlineMutation(
        {
          serverFetch: async () => {
            const res = await fetch(`/api/decks/${deckId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            if (!res.ok) {
              throw new Error("Failed to update deck");
            }
          },
          localMutation: (localDb) => {
            localMutations.updateDeck(localDb, deckId, data);
          },
          queueEntry: () => ({
            endpoint: `/api/decks/${deckId}`,
            method: "PUT",
            body: data,
          }),
          db,
          isOnline,
          queue,
          persist,
        },
        { deckId, ...data },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export function useDeleteDeck(): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  const { db, isOnline, queue, persist } = useOffline();

  return useMutation({
    mutationFn: async (deckId: number) =>
      offlineMutation(
        {
          serverFetch: async () => {
            const res = await fetch(`/api/decks/${deckId}`, {
              method: "DELETE",
            });
            if (!res.ok) {
              throw new Error("Failed to delete deck");
            }
          },
          localMutation: (localDb) => {
            localMutations.deleteDeck(localDb, deckId);
          },
          queueEntry: () => ({
            endpoint: `/api/decks/${deckId}`,
            method: "DELETE",
          }),
          db,
          isOnline,
          queue,
          persist,
        },
        deckId,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
    },
  });
}
