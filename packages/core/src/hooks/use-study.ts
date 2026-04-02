import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTransport } from "../transport";

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
	noteTypeId: string;
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

type SuspendInput = { cardIds: string[]; suspend: boolean };
type BuryInput = { cardIds: string[]; bury?: boolean };

export function useSuspendCards(): UseMutationResult<
	unknown,
	Error,
	SuspendInput
> {
	const transport = useTransport();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SuspendInput) =>
			transport.mutate("/api/cards/suspend", "POST", input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["study-session"] });
			void queryClient.invalidateQueries({ queryKey: ["browse"] });
			void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
		},
	});
}

export function useBuryCard(): UseMutationResult<unknown, Error, BuryInput> {
	const transport = useTransport();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: BuryInput) =>
			transport.mutate("/api/cards/bury", "POST", input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["study-session"] });
			void queryClient.invalidateQueries({ queryKey: ["browse"] });
			void queryClient.invalidateQueries({ queryKey: ["deck-counts"] });
		},
	});
}

export function useIntervalPreviews(
	cardId: string | undefined,
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
