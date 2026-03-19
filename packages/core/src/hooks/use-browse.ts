import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { useTransport } from "../transport";

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
  suspended: boolean;
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
  const transport = useTransport();

  const params: Record<string, string> = {
    q: query,
    page: String(page),
    limit: String(limit),
  };
  if (sortBy) {
    params.sortBy = sortBy;
  }
  if (sortDir) {
    params.sortDir = sortDir;
  }

  return useQuery<BrowseSearchResult>({
    queryKey: ["browse", query, page, limit, sortBy, sortDir],
    queryFn: () => transport.query<BrowseSearchResult>("/api/browse", params),
  });
}

export function useNoteDetail(
  noteId: number | undefined,
): UseQueryResult<NoteDetail> {
  const transport = useTransport();

  return useQuery<NoteDetail>({
    queryKey: ["note-detail", noteId],
    queryFn: () =>
      transport.query<NoteDetail>("/api/browse", {
        noteId: String(noteId),
      }),
    enabled: noteId !== undefined,
  });
}

export function useUpdateNote(): UseMutationResult<
  unknown,
  Error,
  {
    noteId: number;
    fields?: Record<string, string>;
    deckId?: number;
    suspend?: boolean;
    bury?: boolean;
  }
> {
  const transport = useTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => transport.mutate<unknown>("/api/browse", "PATCH", data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["browse"] });
      void queryClient.invalidateQueries({
        queryKey: ["note-detail", variables.noteId],
      });
      if (variables.suspend !== undefined || variables.bury !== undefined) {
        void queryClient.invalidateQueries({ queryKey: ["study-session"] });
        void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
      }
    },
  });
}

export function useDeleteNote(): UseMutationResult<unknown, Error, number> {
  const transport = useTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: number) =>
      transport.mutate<unknown>("/api/browse", "DELETE", { noteId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["browse"] });
    },
  });
}
