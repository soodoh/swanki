import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";

export type CardWithNote = {
  id: string;
  noteId: string;
  deckId: string;
  templateId: string;
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
  id: string;
  questionTemplate: string;
  answerTemplate: string;
};

export type StudySession = {
  cards: CardWithNote[];
  counts: CardCounts;
  templates: Record<string, StudyCardTemplate>;
  css: Record<string, string>;
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
  cardId: string;
  rating: number;
  timeTakenMs: number;
};

type UndoInput = {
  cardId: string;
};

export function useStudySession(deckId: string): UseQueryResult<StudySession> {
  return useQuery<StudySession>({
    queryKey: ["study-session", deckId],
    queryFn: async () => {
      const res = await fetch(`/api/study/${deckId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch study session");
      }
      return res.json() as Promise<StudySession>;
    },
  });
}

export function useSubmitReview(): UseMutationResult<
  unknown,
  Error,
  ReviewInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ReviewInput) => {
      const res = await fetch("/api/study/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to submit review");
      }
      return res.json() as Promise<unknown>;
    },
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

  return useMutation({
    mutationFn: async (data: UndoInput) => {
      const res = await fetch("/api/study/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to undo review");
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["study-session"] });
      void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
    },
  });
}

export function useIntervalPreviews(
  cardId: string | undefined,
): UseQueryResult<Record<number, IntervalPreview>> {
  return useQuery<Record<number, IntervalPreview>>({
    queryKey: ["interval-previews", cardId],
    queryFn: async () => {
      const res = await fetch(`/api/study/preview/${cardId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch interval previews");
      }
      return res.json() as Promise<Record<number, IntervalPreview>>;
    },
    enabled: Boolean(cardId),
  });
}
