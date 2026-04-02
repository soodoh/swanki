import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { AppDb } from "../db/index";
import { cards, notes, reviewLogs } from "../db/schema";

type Db = AppDb;

export type ReviewsPerDay = {
	date: string; // YYYY-MM-DD
	count: number;
};

export type CardStates = {
	new: number;
	learning: number;
	review: number;
	relearning: number;
};

export type Streak = {
	current: number;
	longest: number;
};

export type Heatmap = Record<string, number>; // date (YYYY-MM-DD) -> count

export class StatsService {
	private db: Db;
	constructor(db: Db) {
		this.db = db;
	}

	async getReviewsPerDay(
		userId: string,
		days: number,
	): Promise<ReviewsPerDay[]> {
		const now = new Date();
		now.setUTCHours(0, 0, 0, 0);

		// Calculate start date (N-1 days ago from today at midnight UTC)
		const startDate = new Date(now);
		startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

		// Query review counts grouped by date, filtered by user
		const rows = await this.db
			.select({
				date: sql<string>`date(${reviewLogs.reviewedAt}, 'unixepoch')`,
				count: sql<number>`count(*)`,
			})
			.from(reviewLogs)
			.innerJoin(cards, eq(reviewLogs.cardId, cards.id))
			.innerJoin(notes, eq(cards.noteId, notes.id))
			.where(
				and(eq(notes.userId, userId), gte(reviewLogs.reviewedAt, startDate)),
			)
			.groupBy(sql`date(${reviewLogs.reviewedAt}, 'unixepoch')`)
			.all();

		// Build a map of date -> count from query results
		const countMap = new Map<string, number>();
		for (const row of rows) {
			countMap.set(row.date, Number(row.count));
		}

		// Build full array with 0-count days filled in
		const result: ReviewsPerDay[] = [];
		for (let i = days - 1; i >= 0; i -= 1) {
			const d = new Date(now);
			d.setUTCDate(d.getUTCDate() - i);
			const dateStr = d.toISOString().split("T")[0];
			result.push({
				date: dateStr,
				count: countMap.get(dateStr) ?? 0,
			});
		}

		return result;
	}

	async getCardStates(userId: string): Promise<CardStates> {
		const rows = await this.db
			.select({
				state: cards.state,
				count: sql<number>`count(*)`,
			})
			.from(cards)
			.innerJoin(notes, eq(cards.noteId, notes.id))
			.where(eq(notes.userId, userId))
			.groupBy(cards.state)
			.all();

		const states: CardStates = {
			new: 0,
			learning: 0,
			review: 0,
			relearning: 0,
		};

		for (const row of rows) {
			const state = row.state ?? 0;
			if (state === 0) {
				states.new = Number(row.count);
			} else if (state === 1) {
				states.learning = Number(row.count);
			} else if (state === 2) {
				states.review = Number(row.count);
			} else if (state === 3) {
				states.relearning = Number(row.count);
			}
		}

		return states;
	}

	async getStreak(userId: string): Promise<Streak> {
		// Get all distinct dates (UTC) with reviews for this user, ordered desc
		const rows = await this.db
			.select({
				date: sql<string>`date(${reviewLogs.reviewedAt}, 'unixepoch')`,
			})
			.from(reviewLogs)
			.innerJoin(cards, eq(reviewLogs.cardId, cards.id))
			.innerJoin(notes, eq(cards.noteId, notes.id))
			.where(eq(notes.userId, userId))
			.groupBy(sql`date(${reviewLogs.reviewedAt}, 'unixepoch')`)
			.orderBy(sql`date(${reviewLogs.reviewedAt}, 'unixepoch') desc`)
			.all();

		if (rows.length === 0) {
			return { current: 0, longest: 0 };
		}

		const reviewDates = new Set(rows.map((r) => r.date));

		// Get today's date string in UTC
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		const todayStr = today.toISOString().split("T")[0];

		// Calculate current streak: walk backwards from today
		let current = 0;
		if (reviewDates.has(todayStr)) {
			current = 1;
			const d = new Date(today);
			while (true) {
				d.setUTCDate(d.getUTCDate() - 1);
				const ds = d.toISOString().split("T")[0];
				if (reviewDates.has(ds)) {
					current += 1;
				} else {
					break;
				}
			}
		}

		// Calculate longest streak: walk through all dates sorted ascending
		const reviewDateArray: string[] = rows.map((r) => r.date);
		const sortedDates: string[] = reviewDateArray.toSorted();
		let longest = 0;
		let streak = 0;

		for (let i = 0; i < sortedDates.length; i += 1) {
			if (i === 0) {
				streak = 1;
			} else {
				const prev = new Date(`${sortedDates[i - 1]}T00:00:00Z`);
				const curr = new Date(`${sortedDates[i]}T00:00:00Z`);
				const diffMs = curr.getTime() - prev.getTime();
				const diffDays = diffMs / (24 * 60 * 60 * 1000);

				if (diffDays === 1) {
					streak += 1;
				} else {
					streak = 1;
				}
			}
			if (streak > longest) {
				longest = streak;
			}
		}

		return { current, longest };
	}

	async getHeatmap(userId: string, year: number): Promise<Heatmap> {
		const startDate = new Date(`${year}-01-01T00:00:00Z`);
		const endDate = new Date(`${year + 1}-01-01T00:00:00Z`);

		const rows = await this.db
			.select({
				date: sql<string>`date(${reviewLogs.reviewedAt}, 'unixepoch')`,
				count: sql<number>`count(*)`,
			})
			.from(reviewLogs)
			.innerJoin(cards, eq(reviewLogs.cardId, cards.id))
			.innerJoin(notes, eq(cards.noteId, notes.id))
			.where(
				and(
					eq(notes.userId, userId),
					gte(reviewLogs.reviewedAt, startDate),
					lte(reviewLogs.reviewedAt, endDate),
				),
			)
			.groupBy(sql`date(${reviewLogs.reviewedAt}, 'unixepoch')`)
			.all();

		const heatmap: Heatmap = {};
		for (const row of rows) {
			heatmap[row.date] = Number(row.count);
		}

		return heatmap;
	}
}
