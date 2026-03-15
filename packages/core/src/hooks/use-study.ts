import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { useTransport } from "../transport";

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
  const transport = useTransport();

  return useQuery<StudySession>({
    queryKey: ["study-session", deckId],
    queryFn: () => transport.query<StudySession>(`/api/study/${deckId}`),
  });
}

export function useSubmitReview(): UseMutationResult<
  unknown,
  Error,
  ReviewInput
> {
  const transport = useTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ReviewInput) =>
      transport.mutate<unknown>("/api/study/review", "POST", data),
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
  const transport = useTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UndoInput) =>
      transport.mutate<unknown>("/api/study/undo", "POST", data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["study-session"] });
      void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
    },
  });
}

export function useIntervalPreviews(
  cardId: number | undefined,
): UseQueryResult<Record<number, IntervalPreview>> {
  const transport = useTransport();

  return useQuery<Record<number, IntervalPreview>>({
    queryKey: ["interval-previews", cardId],
    queryFn: () =>
      transport.query<Record<number, IntervalPreview>>(
        `/api/study/preview/${cardId}`,
      ),
    enabled: cardId !== undefined,
  });
}
