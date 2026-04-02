import type { Card as FsrsCard, Grade, RecordLogItem } from "ts-fsrs";
import { createEmptyCard, fsrs, Rating, State } from "ts-fsrs";

export type { Grade };
export { Rating, State };

type DbCard = {
	due: Date;
	stability: number | undefined;
	difficulty: number | undefined;
	elapsedDays: number | undefined;
	scheduledDays: number | undefined;
	reps: number | undefined;
	lapses: number | undefined;
	state: number | undefined;
	lastReview: Date | undefined;
};

export type FsrsResult = {
	card: {
		due: Date;
		stability: number;
		difficulty: number;
		elapsedDays: number;
		scheduledDays: number;
		reps: number;
		lapses: number;
		state: number;
		lastReview: Date;
	};
	log: {
		rating: number;
		state: number;
		due: Date;
		stability: number;
		difficulty: number;
		elapsedDays: number;
		lastElapsedDays: number;
		scheduledDays: number;
		review: Date;
	};
};

export type IntervalPreview = {
	rating: number;
	due: Date;
	stability: number;
	difficulty: number;
	state: number;
	scheduledDays: number;
};

const f = fsrs();

function toFsrsCard(card: DbCard): FsrsCard {
	if (
		card.reps === 0 ||
		card.reps === undefined ||
		(card.state === 0 && !card.lastReview)
	) {
		// New card — use createEmptyCard with the card's due date
		return createEmptyCard(card.due);
	}

	return {
		due: card.due,
		stability: card.stability ?? 0,
		difficulty: card.difficulty ?? 0,
		// oxlint-disable-next-line no-deprecated -- elapsed_days required by ts-fsrs Card interface
		elapsed_days: card.elapsedDays ?? 0,
		scheduled_days: card.scheduledDays ?? 0,
		reps: card.reps ?? 0,
		lapses: card.lapses ?? 0,
		state: (card.state ?? 0) as State,
		last_review: card.lastReview ?? undefined,
		learning_steps: 0,
	};
}

function fromFsrsResult(item: RecordLogItem): FsrsResult {
	return {
		card: {
			due: item.card.due,
			stability: item.card.stability,
			difficulty: item.card.difficulty,
			// oxlint-disable-next-line no-deprecated -- elapsed_days required by ts-fsrs
			elapsedDays: item.card.elapsed_days,
			scheduledDays: item.card.scheduled_days,
			reps: item.card.reps,
			lapses: item.card.lapses,
			state: item.card.state as number,
			lastReview: item.card.last_review!,
		},
		log: {
			rating: item.log.rating as number,
			state: item.log.state as number,
			due: item.log.due,
			stability: item.log.stability,
			difficulty: item.log.difficulty,
			// oxlint-disable-next-line no-deprecated -- elapsed_days required by ts-fsrs
			elapsedDays: item.log.elapsed_days,
			// oxlint-disable-next-line no-deprecated -- last_elapsed_days required by ts-fsrs
			lastElapsedDays: item.log.last_elapsed_days,
			scheduledDays: item.log.scheduled_days,
			review: item.log.review,
		},
	};
}

export function scheduleFsrs(
	card: DbCard,
	rating: Grade,
	now?: Date,
): FsrsResult {
	const fsrsCard = toFsrsCard(card);
	const reviewTime = now ?? new Date();
	const result = f.repeat(fsrsCard, reviewTime);
	return fromFsrsResult(result[rating]);
}

export function previewAll(
	card: DbCard,
	now?: Date,
): Record<number, IntervalPreview> {
	const fsrsCard = toFsrsCard(card);
	const reviewTime = now ?? new Date();
	const result = f.repeat(fsrsCard, reviewTime);

	const previews: Record<number, IntervalPreview> = {};
	const grades: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

	for (const grade of grades) {
		const item = result[grade];
		previews[grade as number] = {
			rating: grade as number,
			due: item.card.due,
			stability: item.card.stability,
			difficulty: item.card.difficulty,
			state: item.card.state as number,
			scheduledDays: item.card.scheduled_days,
		};
	}

	return previews;
}
