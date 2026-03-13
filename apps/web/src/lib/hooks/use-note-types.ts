import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";

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
  return useQuery<NoteTypeWithTemplates[]>({
    queryKey: ["note-types"],
    queryFn: async () => {
      const res = await fetch("/api/note-types");
      if (!res.ok) {
        throw new Error("Failed to fetch note types");
      }
      return res.json() as Promise<NoteTypeWithTemplates[]>;
    },
  });
}

export function useNoteType(
  id: number | undefined,
): UseQueryResult<NoteTypeWithTemplates> {
  return useQuery<NoteTypeWithTemplates>({
    queryKey: ["note-types", id],
    queryFn: async () => {
      const res = await fetch(`/api/note-types/${id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch note type");
      }
      return res.json() as Promise<NoteTypeWithTemplates>;
    },
    enabled: id !== undefined,
  });
}

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
