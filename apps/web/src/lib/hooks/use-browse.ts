import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";

export type BrowseCard = {
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
  noteTags: string;
  deckName: string;
};

export type BrowseSearchResult = {
  cards: BrowseCard[];
  total: number;
  page: number;
  limit: number;
};

export type CardDetail = {
  card: {
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
  };
  note: {
    id: string;
    userId: string;
    noteTypeId: string;
    fields: Record<string, string>;
    tags: string | undefined;
    createdAt: string;
    updatedAt: string;
  };
  noteType: {
    id: string;
    name: string;
    fields: string;
  };
  templates: Array<{
    id: string;
    name: string;
    questionTemplate: string;
    answerTemplate: string;
  }>;
  recentReviews: Array<{
    id: string;
    cardId: string;
    rating: number;
    state: number;
    reviewedAt: string;
    elapsedDays: number | undefined;
    scheduledDays: number | undefined;
    timeTakenMs: number | undefined;
  }>;
  deckName: string;
};

export type BrowseOptions = {
  page?: number;
  limit?: number;
  sortBy?: "due" | "created" | "updated";
  sortDir?: "asc" | "desc";
};

export function useBrowse(
  query: string,
  options?: BrowseOptions,
): UseQueryResult<BrowseSearchResult> {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const sortBy = options?.sortBy;
  const sortDir = options?.sortDir;

  return useQuery<BrowseSearchResult>({
    queryKey: ["browse", query, page, limit, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (sortBy) {
        params.set("sortBy", sortBy);
      }
      if (sortDir) {
        params.set("sortDir", sortDir);
      }

      const res = await fetch(`/api/browse?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch browse results");
      }
      return res.json() as Promise<BrowseSearchResult>;
    },
  });
}

export function useCardDetail(
  cardId: string | undefined,
): UseQueryResult<CardDetail> {
  return useQuery<CardDetail>({
    queryKey: ["card-detail", cardId],
    queryFn: async () => {
      const res = await fetch(`/api/browse?cardId=${cardId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch card detail");
      }
      return res.json() as Promise<CardDetail>;
    },
    enabled: Boolean(cardId),
  });
}

export function useUpdateCard(): UseMutationResult<
  unknown,
  Error,
  { cardId: string; fields?: Record<string, string>; deckId?: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      cardId: string;
      fields?: Record<string, string>;
      deckId?: string;
    }) => {
      const res = await fetch("/api/browse", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to update card");
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["browse"] });
      void queryClient.invalidateQueries({
        queryKey: ["card-detail", variables.cardId],
      });
    },
  });
}
