import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";

export type BrowseNote = {
  noteId: number;
  noteTypeId: number;
  noteTypeName: string;
  fields: Record<string, string>;
  tags: string;
  deckName: string;
  deckId: number;
  cardCount: number;
  earliestDue: string | undefined;
  states: number[];
  createdAt: string;
  updatedAt: string;
};

export type BrowseSearchResult = {
  notes: BrowseNote[];
  total: number;
  page: number;
  limit: number;
};

export type NoteDetail = {
  note: {
    id: number;
    userId: string;
    noteTypeId: number;
    fields: Record<string, string>;
    tags: string | undefined;
    createdAt: string;
    updatedAt: string;
  };
  noteType: {
    id: number;
    name: string;
    fields: string;
    css: string;
  };
  templates: Array<{
    id: number;
    name: string;
    questionTemplate: string;
    answerTemplate: string;
  }>;
  deckName: string;
  deckId: number;
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

export function useNoteDetail(
  noteId: number | undefined,
): UseQueryResult<NoteDetail> {
  return useQuery<NoteDetail>({
    queryKey: ["note-detail", noteId],
    queryFn: async () => {
      const res = await fetch(`/api/browse?noteId=${noteId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch note detail");
      }
      return res.json() as Promise<NoteDetail>;
    },
    enabled: noteId !== undefined,
  });
}

export function useUpdateNote(): UseMutationResult<
  unknown,
  Error,
  { noteId: number; fields?: Record<string, string>; deckId?: number }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      noteId: number;
      fields?: Record<string, string>;
      deckId?: number;
    }) => {
      const res = await fetch("/api/browse", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to update note");
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["browse"] });
      void queryClient.invalidateQueries({
        queryKey: ["note-detail", variables.noteId],
      });
    },
  });
}

export function useDeleteNote(): UseMutationResult<unknown, Error, number> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: number) => {
      const res = await fetch("/api/browse", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      });
      if (!res.ok) {
        throw new Error("Failed to delete note");
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["browse"] });
    },
  });
}
