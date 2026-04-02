import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTransport } from "../transport";

export type NoteTypeField = {
	name: string;
	ordinal: number;
};

export type CardTemplate = {
	id: string;
	noteTypeId: string;
	name: string;
	ordinal: number;
	questionTemplate: string;
	answerTemplate: string;
};

export type NoteType = {
	id: string;
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
	const transport = useTransport();

	return useQuery<NoteTypeWithTemplates[]>({
		queryKey: ["note-types"],
		queryFn: () => transport.query<NoteTypeWithTemplates[]>("/api/note-types"),
	});
}

export function useNoteType(
	id: string | undefined,
): UseQueryResult<NoteTypeWithTemplates> {
	const transport = useTransport();

	return useQuery<NoteTypeWithTemplates>({
		queryKey: ["note-types", id],
		queryFn: () =>
			transport.query<NoteTypeWithTemplates>(`/api/note-types/${id}`),
		enabled: id !== undefined,
	});
}

export function useSampleNote(
	noteTypeId: string | undefined,
): UseQueryResult<Record<string, string> | undefined> {
	const transport = useTransport();

	return useQuery<Record<string, string> | undefined>({
		queryKey: ["note-types", noteTypeId, "sample-note"],
		queryFn: async () => {
			const data = await transport.query<{
				fields: Record<string, string> | undefined;
			}>(`/api/note-types/${noteTypeId}/sample-note`);
			return data.fields;
		},
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
	const transport = useTransport();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: {
			name: string;
			fields: NoteTypeField[];
			css?: string;
		}) => transport.mutate<NoteType>("/api/note-types", "POST", data),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["note-types"] });
		},
	});
}

export function useUpdateNoteType(): UseMutationResult<
	NoteType,
	Error,
	{
		id: string;
		name?: string;
		fields?: NoteTypeField[];
		css?: string;
	}
> {
	const transport = useTransport();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: {
			id: string;
			name?: string;
			fields?: NoteTypeField[];
			css?: string;
		}) => {
			const { id, ...body } = data;
			return transport.mutate<NoteType>(`/api/note-types/${id}`, "PUT", body);
		},
		onSuccess: (_data, variables) => {
			void queryClient.invalidateQueries({ queryKey: ["note-types"] });
			void queryClient.invalidateQueries({
				queryKey: ["note-types", variables.id],
			});
		},
	});
}

export function useDeleteNoteType(): UseMutationResult<void, Error, string> {
	const transport = useTransport();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			transport.mutate<void>(`/api/note-types/${id}`, "DELETE"),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["note-types"] });
		},
	});
}

export function useCreateTemplate(): UseMutationResult<
	CardTemplate,
	Error,
	{
		noteTypeId: string;
		name: string;
		questionTemplate: string;
		answerTemplate: string;
	}
> {
	const transport = useTransport();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: {
			noteTypeId: string;
			name: string;
			questionTemplate: string;
			answerTemplate: string;
		}) =>
			transport.mutate<CardTemplate>("/api/note-types/templates", "POST", data),
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
		templateId: string;
		noteTypeId: string;
		questionTemplate?: string;
		answerTemplate?: string;
	}
> {
	const transport = useTransport();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: {
			templateId: string;
			noteTypeId: string;
			questionTemplate?: string;
			answerTemplate?: string;
		}) => {
			const { templateId, noteTypeId: _, ...body } = data;
			return transport.mutate<CardTemplate>(
				`/api/note-types/templates/${templateId}`,
				"PUT",
				body,
			);
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
	{ templateId: string; noteTypeId: string }
> {
	const transport = useTransport();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: { templateId: string; noteTypeId: string }) =>
			transport.mutate<void>(
				`/api/note-types/templates/${data.templateId}`,
				"DELETE",
			),
		onSuccess: (_data, variables) => {
			void queryClient.invalidateQueries({ queryKey: ["note-types"] });
			void queryClient.invalidateQueries({
				queryKey: ["note-types", variables.noteTypeId],
			});
		},
	});
}
