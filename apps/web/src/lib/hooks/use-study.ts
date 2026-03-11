import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { useOffline } from "@/lib/offline/offline-provider";
import { offlineQuery, offlineMutation } from "@/lib/offline/offline-fetch";
import * as localQueries from "@/lib/offline/local-queries";
import * as localMutations from "@/lib/offline/local-mutations";

export type CardWithNote = {
  id: number;
  noteId: number;
  deckId: number;
  templateId: number;
  ordinal: number;
  due: string;
  stability: number | undefined;
  difficulty: number | undefined;
  elapsedDays: number | undefined;
  scheduledDays: number | undefined;
  reps: number | undefined;
  lapses: number | undefined;
  state: number | undefined;
  lastReview: string | undefined;
  createdAt: string;
  updatedAt: string;
  noteFields: Record<string, string>;
};

export type CardCounts = {
  new: number;
  learning: number;
  review: number;
};

export type StudyCardTemplate = {
  id: number;
  noteTypeId: number;
  questionTemplate: string;
  answerTemplate: string;
};

export type StudySession = {
  cards: CardWithNote[];
  counts: CardCounts;
  templates: Record<number, StudyCardTemplate>;
  css: Record<number, string>;
};

export type IntervalPreview = {
  rating: number;
  due: string;
  stability: number;
  difficulty: number;
  state: number;
  scheduledDays: number;
};

type ReviewInput = {
  cardId: number;
  rating: number;
  timeTakenMs: number;
};

type UndoInput = {
  cardId: number;
};

export function useStudySession(deckId: number): UseQueryResult<StudySession> {
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<StudySession>({
    queryKey: ["study-session", deckId],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch(`/api/study/${deckId}`);
          if (!res.ok) {
            throw new Error("Failed to fetch study session");
          }
          return res.json() as Promise<StudySession>;
        },
        localQuery: (localDb) => localQueries.getStudySession(localDb, deckId),
        db,
        isOnline,
        isLocalReady,
      }),
  });
}

export function useSubmitReview(): UseMutationResult<
  unknown,
  Error,
  ReviewInput
> {
  const queryClient = useQueryClient();
  const { db, isOnline, queue, persist } = useOffline();

  return useMutation({
    mutationFn: async (data: ReviewInput) =>
      offlineMutation(
        {
          serverFetch: async (input) => {
            const res = await fetch("/api/study/review", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            });
            if (!res.ok) {
              throw new Error("Failed to submit review");
            }
            return res.json() as Promise<unknown>;
          },
          localMutation: (localDb, input) => {
            localMutations.submitReview(
              localDb,
              input.cardId,
              input.rating,
              input.timeTakenMs,
            );
          },
          queueEntry: (input) => ({
            endpoint: "/api/study/review",
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
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["study-session"] });
      void queryClient.invalidateQueries({
        queryKey: ["interval-previews", variables.cardId],
      });
      void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
    },
  });
}

export function useUndoReview(): UseMutationResult<unknown, Error, UndoInput> {
  const queryClient = useQueryClient();
  const { db, isOnline, queue, persist } = useOffline();

  return useMutation({
    mutationFn: async (data: UndoInput) =>
      offlineMutation(
        {
          serverFetch: async (input) => {
            const res = await fetch("/api/study/undo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            });
            if (!res.ok) {
              throw new Error("Failed to undo review");
            }
            return res.json() as Promise<unknown>;
          },
          localMutation: (localDb, input) => {
            localMutations.undoReview(localDb, input.cardId);
          },
          queueEntry: (input) => ({
            endpoint: "/api/study/undo",
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
      void queryClient.invalidateQueries({ queryKey: ["study-session"] });
      void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
    },
  });
}

export function useIntervalPreviews(
  cardId: number | undefined,
): UseQueryResult<Record<number, IntervalPreview>> {
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<Record<number, IntervalPreview>>({
    queryKey: ["interval-previews", cardId],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch(`/api/study/preview/${cardId}`);
          if (!res.ok) {
            throw new Error("Failed to fetch interval previews");
          }
          return res.json() as Promise<Record<number, IntervalPreview>>;
        },
        localQuery: (localDb) =>
          cardId
            ? localQueries.getIntervalPreviews(localDb, cardId)
            : undefined,
        db,
        isOnline,
        isLocalReady,
      }),
    enabled: cardId !== undefined,
  });
}
