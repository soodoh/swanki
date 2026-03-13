import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { useOffline } from "@/lib/offline/offline-provider";
import { offlineQuery } from "@/lib/offline/offline-fetch";
import * as localQueries from "@/lib/offline/local-queries";

export type NoteTypeField = {
  name: string;
  ordinal: number;
};

export type CardTemplate = {
  id: number;
  noteTypeId: number;
  name: string;
  ordinal: number;
  questionTemplate: string;
  answerTemplate: string;
};

export type NoteType = {
  id: number;
  userId: string;
  name: string;
  fields: NoteTypeField[];
  css: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteTypeWithTemplates = {
  noteType: NoteType;
  templates: CardTemplate[];
};

export function useNoteTypes(): UseQueryResult<NoteTypeWithTemplates[]> {
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<NoteTypeWithTemplates[]>({
    queryKey: ["note-types"],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch("/api/note-types");
          if (!res.ok) {
            throw new Error("Failed to fetch note types");
          }
          return res.json() as Promise<NoteTypeWithTemplates[]>;
        },
        localQuery: (localDb) => localQueries.getNoteTypes(localDb),
        db,
        isOnline,
        isLocalReady,
      }),
  });
}

export function useNoteType(
  id: number | undefined,
): UseQueryResult<NoteTypeWithTemplates> {
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<NoteTypeWithTemplates>({
    queryKey: ["note-types", id],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch(`/api/note-types/${id}`);
          if (!res.ok) {
            throw new Error("Failed to fetch note type");
          }
          return res.json() as Promise<NoteTypeWithTemplates>;
        },
        localQuery: (localDb) =>
          id ? localQueries.getNoteType(localDb, id) : undefined,
        db,
        isOnline,
        isLocalReady,
      }),
    enabled: id !== undefined,
  });
}

export function useSampleNote(
  noteTypeId: number | undefined,
): UseQueryResult<Record<string, string> | undefined> {
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<Record<string, string> | undefined>({
    queryKey: ["note-types", noteTypeId, "sample-note"],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch(`/api/note-types/${noteTypeId}/sample-note`);
          if (!res.ok) {
            throw new Error("Failed to fetch sample note");
          }
          const data = (await res.json()) as {
            fields: Record<string, string> | undefined;
          };
          return data.fields;
        },
        localQuery: (localDb) =>
          noteTypeId
            ? localQueries.getFirstNoteFields(localDb, noteTypeId)
            : undefined,
        db,
        isOnline,
        isLocalReady,
      }),
    enabled: noteTypeId !== undefined,
  });
}

// Mutations remain server-only for now since note type CRUD is less
// latency-sensitive and has complex side effects (card generation).
// They still work online and fall back gracefully.

export function useCreateNoteType(): UseMutationResult<
  NoteType,
  Error,
  { name: string; fields: NoteTypeField[]; css?: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      fields: NoteTypeField[];
      css?: string;
    }) => {
      const res = await fetch("/api/note-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to create note type");
      }
      return res.json() as Promise<NoteType>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["note-types"] });
    },
  });
}

export function useUpdateNoteType(): UseMutationResult<
  NoteType,
  Error,
  {
    id: number;
    name?: string;
    fields?: NoteTypeField[];
    css?: string;
  }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: number;
      name?: string;
      fields?: NoteTypeField[];
      css?: string;
    }) => {
      const { id, ...body } = data;
      const res = await fetch(`/api/note-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error("Failed to update note type");
      }
      return res.json() as Promise<NoteType>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["note-types"] });
      void queryClient.invalidateQueries({
        queryKey: ["note-types", variables.id],
      });
    },
  });
}

export function useDeleteNoteType(): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/note-types/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to delete note type");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["note-types"] });
    },
  });
}

export function useCreateTemplate(): UseMutationResult<
  CardTemplate,
  Error,
  {
    noteTypeId: number;
    name: string;
    questionTemplate: string;
    answerTemplate: string;
  }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      noteTypeId: number;
      name: string;
      questionTemplate: string;
      answerTemplate: string;
    }) => {
      const res = await fetch("/api/note-types/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to create template");
      }
      return res.json() as Promise<CardTemplate>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["note-types"] });
      void queryClient.invalidateQueries({
        queryKey: ["note-types", variables.noteTypeId],
      });
    },
  });
}

export function useUpdateTemplate(): UseMutationResult<
  CardTemplate,
  Error,
  {
    templateId: number;
    noteTypeId: number;
    questionTemplate?: string;
    answerTemplate?: string;
  }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      templateId: number;
      noteTypeId: number;
      questionTemplate?: string;
      answerTemplate?: string;
    }) => {
      const { templateId, noteTypeId: _, ...body } = data;
      const res = await fetch(`/api/note-types/templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error("Failed to update template");
      }
      return res.json() as Promise<CardTemplate>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["note-types"] });
      void queryClient.invalidateQueries({
        queryKey: ["note-types", variables.noteTypeId],
      });
    },
  });
}

export function useDeleteTemplate(): UseMutationResult<
  void,
  Error,
  { templateId: number; noteTypeId: number }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { templateId: number; noteTypeId: number }) => {
      const res = await fetch(`/api/note-types/templates/${data.templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete template");
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["note-types"] });
      void queryClient.invalidateQueries({
        queryKey: ["note-types", variables.noteTypeId],
      });
    },
  });
}
