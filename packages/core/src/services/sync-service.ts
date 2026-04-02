/**
 * Server-side sync service.
 * Provides full and delta pulls of user data for offline sync.
 * Provides push with LWW conflict resolution.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { AppDb } from "../db/index";
import {
	cards,
	cardTemplates,
	decks,
	deletions,
	media,
	noteMedia,
	notes,
	noteTypes,
	reviewLogs,
} from "../db/schema";
import type {
	SyncPullResponse,
	SyncPushRequest,
	SyncPushResponse,
} from "./sync-types";

export type { SyncPullResponse, SyncPushRequest, SyncPushResponse };

type Db = AppDb;

export class SyncService {
	private db: Db;
	constructor(db: Db) {
		this.db = db;
	}

	/**
	 * Full pull: returns all data for a user.
	 * Used on first sync when the client has no local data.
	 */
	async pullFull(userId: string): Promise<SyncPullResponse> {
		const now = Date.now();

		const userDecks = await this.db
			.select()
			.from(decks)
			.where(eq(decks.userId, userId))
			.all();

		const userNoteTypes = await this.db
			.select()
			.from(noteTypes)
			.where(eq(noteTypes.userId, userId))
			.all();

		// Card templates for user's note types
		const noteTypeIds = userNoteTypes.map((nt) => nt.id);
		let userCardTemplates: Array<Record<string, unknown>> = [];
		if (noteTypeIds.length > 0) {
			userCardTemplates = (await this.db
				.select()
				.from(cardTemplates)
				.where(
					sql`${cardTemplates.noteTypeId} IN (${sql.join(
						noteTypeIds.map((id) => sql`${id}`),
						sql`, `,
					)})`,
				)
				.all()) as Array<Record<string, unknown>>;
		}

		const userNotes = await this.db
			.select()
			.from(notes)
			.where(eq(notes.userId, userId))
			.all();

		// Cards for user's notes
		const noteIds = userNotes.map((n) => n.id);
		let userCards: Array<Record<string, unknown>> = [];
		if (noteIds.length > 0) {
			userCards = (await this.db
				.select()
				.from(cards)
				.where(
					sql`${cards.noteId} IN (${sql.join(
						noteIds.map((id) => sql`${id}`),
						sql`, `,
					)})`,
				)
				.all()) as Array<Record<string, unknown>>;
		}

		// Review logs for user's cards
		const cardIds = (userCards as Array<{ id: string }>).map((c) => c.id);
		let userReviewLogs: Array<Record<string, unknown>> = [];
		if (cardIds.length > 0) {
			userReviewLogs = (await this.db
				.select()
				.from(reviewLogs)
				.where(
					sql`${reviewLogs.cardId} IN (${sql.join(
						cardIds.map((id) => sql`${id}`),
						sql`, `,
					)})`,
				)
				.all()) as Array<Record<string, unknown>>;
		}

		const userMedia = await this.db
			.select()
			.from(media)
			.where(eq(media.userId, userId))
			.all();

		// Note-media junctions for user's notes
		let userNoteMedia: Array<Record<string, unknown>> = [];
		if (noteIds.length > 0) {
			userNoteMedia = (await this.db
				.select()
				.from(noteMedia)
				.where(
					sql`${noteMedia.noteId} IN (${sql.join(
						noteIds.map((id) => sql`${id}`),
						sql`, `,
					)})`,
				)
				.all()) as Array<Record<string, unknown>>;
		}

		return {
			decks: userDecks as Array<Record<string, unknown>>,
			noteTypes: userNoteTypes as Array<Record<string, unknown>>,
			cardTemplates: userCardTemplates,
			notes: userNotes as Array<Record<string, unknown>>,
			cards: userCards,
			reviewLogs: userReviewLogs,
			media: userMedia as Array<Record<string, unknown>>,
			noteMedia: userNoteMedia,
			deletions: [],
			syncedAt: now,
		};
	}

	/**
	 * Delta pull: returns only data changed since `since` timestamp.
	 * Tables with updated_at are filtered; tables without (reviewLogs, cardTemplates)
	 * are returned in full if any parent was modified.
	 */
	async pullDelta(userId: string, since: number): Promise<SyncPullResponse> {
		const now = Date.now();
		const sinceDate = new Date(since);

		const userDecks = await this.db
			.select()
			.from(decks)
			.where(and(eq(decks.userId, userId), gte(decks.updatedAt, sinceDate)))
			.all();

		const userNoteTypes = await this.db
			.select()
			.from(noteTypes)
			.where(
				and(eq(noteTypes.userId, userId), gte(noteTypes.updatedAt, sinceDate)),
			)
			.all();

		// For delta, re-fetch all card templates for modified note types
		const modifiedNtIds = userNoteTypes.map((nt) => nt.id);
		let userCardTemplates: Array<Record<string, unknown>> = [];
		if (modifiedNtIds.length > 0) {
			userCardTemplates = (await this.db
				.select()
				.from(cardTemplates)
				.where(
					sql`${cardTemplates.noteTypeId} IN (${sql.join(
						modifiedNtIds.map((id) => sql`${id}`),
						sql`, `,
					)})`,
				)
				.all()) as Array<Record<string, unknown>>;
		}

		const userNotes = await this.db
			.select()
			.from(notes)
			.where(and(eq(notes.userId, userId), gte(notes.updatedAt, sinceDate)))
			.all();

		const userCards = (
			await this.db
				.select()
				.from(cards)
				.innerJoin(notes, eq(cards.noteId, notes.id))
				.where(and(eq(notes.userId, userId), gte(cards.updatedAt, sinceDate)))
				.all()
		).map((r) => r.cards);

		// Review logs since the timestamp
		const userReviewLogs = (
			await this.db
				.select()
				.from(reviewLogs)
				.innerJoin(cards, eq(reviewLogs.cardId, cards.id))
				.innerJoin(notes, eq(cards.noteId, notes.id))
				.where(
					and(eq(notes.userId, userId), gte(reviewLogs.reviewedAt, sinceDate)),
				)
				.all()
		).map((r) => r.review_logs);

		// Media doesn't have updated_at, so check created_at
		const userMedia = await this.db
			.select()
			.from(media)
			.where(and(eq(media.userId, userId), gte(media.createdAt, sinceDate)))
			.all();

		// Note-media for modified notes
		const modifiedNoteIds = userNotes.map((n) => n.id);
		let userNoteMedia: Array<Record<string, unknown>> = [];
		if (modifiedNoteIds.length > 0) {
			userNoteMedia = (await this.db
				.select()
				.from(noteMedia)
				.where(
					sql`${noteMedia.noteId} IN (${sql.join(
						modifiedNoteIds.map((id) => sql`${id}`),
						sql`, `,
					)})`,
				)
				.all()) as Array<Record<string, unknown>>;
		}

		// Query tombstones since the given timestamp
		const tombstones = await this.db
			.select()
			.from(deletions)
			.where(
				and(eq(deletions.userId, userId), gte(deletions.deletedAt, sinceDate)),
			)
			.all();

		const deletionsList = tombstones.map((t) => ({
			tableName: t.tableName,
			entityId: t.entityId,
			deletedAt: t.deletedAt.getTime(),
		}));

		return {
			decks: userDecks as Array<Record<string, unknown>>,
			noteTypes: userNoteTypes as Array<Record<string, unknown>>,
			cardTemplates: userCardTemplates,
			notes: userNotes as Array<Record<string, unknown>>,
			cards: userCards as Array<Record<string, unknown>>,
			reviewLogs: userReviewLogs as Array<Record<string, unknown>>,
			media: userMedia as Array<Record<string, unknown>>,
			noteMedia: userNoteMedia,
			deletions: deletionsList,
			syncedAt: now,
		};
	}

	/**
	 * Push: receives client changes and applies them with LWW conflict resolution.
	 */
	async push(
		userId: string,
		payload: SyncPushRequest,
	): Promise<SyncPushResponse> {
		const conflicts: SyncPushResponse["conflicts"] = [];
		const mediaToUpload: string[] = [];

		// Reverse FK order for deletions: children before parents
		const DELETION_ORDER = [
			"note_media",
			"media",
			"review_logs",
			"cards",
			"notes",
			"card_templates",
			"decks",
			"note_types",
		];

		await this.db.run(sql`BEGIN`);

		try {
			// Helper: convert a numeric timestamp (epoch ms) to a Date
			const toDate = (v: unknown): Date | undefined => {
				if (v instanceof Date) return v;
				if (typeof v === "number") return new Date(v);
				return undefined;
			};

			// Helper: get the updatedAt from a record as epoch ms for comparison
			const getUpdatedAtMs = (row: Record<string, unknown>): number => {
				const v = row.updatedAt ?? row.updated_at;
				if (v instanceof Date) return v.getTime();
				if (typeof v === "number") return v;
				return 0;
			};

			// ---- Process tables in FK order ----

			// 1. noteTypes (has userId, updatedAt)
			for (const entity of payload.noteTypes) {
				const id = entity.id as string;
				const existing = await this.db
					.select()
					.from(noteTypes)
					.where(eq(noteTypes.id, id))
					.get();

				if (!existing) {
					await this.db
						.insert(noteTypes)
						.values({
							id,
							userId,
							name: entity.name as string,
							fields: entity.fields as Array<{ name: string; ordinal: number }>,
							css: (entity.css as string) ?? "",
							createdAt: toDate(entity.createdAt) ?? new Date(),
							updatedAt: toDate(entity.updatedAt) ?? new Date(),
						})
						.run();
				} else {
					const incomingMs = getUpdatedAtMs(entity);
					const existingMs = existing.updatedAt.getTime();
					if (incomingMs >= existingMs) {
						await this.db
							.update(noteTypes)
							.set({
								name: entity.name as string,
								fields: entity.fields as Array<{
									name: string;
									ordinal: number;
								}>,
								css: (entity.css as string) ?? existing.css,
								updatedAt: toDate(entity.updatedAt) ?? new Date(),
							})
							.where(eq(noteTypes.id, id))
							.run();
						conflicts.push({
							tableName: "noteTypes",
							entityId: id,
							winner: "client",
						});
					} else {
						conflicts.push({
							tableName: "noteTypes",
							entityId: id,
							winner: "server",
						});
					}
				}
			}

			// 2. cardTemplates (has updatedAt, no userId)
			for (const entity of payload.cardTemplates) {
				const id = entity.id as string;
				const existing = await this.db
					.select()
					.from(cardTemplates)
					.where(eq(cardTemplates.id, id))
					.get();

				if (!existing) {
					await this.db
						.insert(cardTemplates)
						.values({
							id,
							noteTypeId: entity.noteTypeId as string,
							name: entity.name as string,
							ordinal: entity.ordinal as number,
							questionTemplate: entity.questionTemplate as string,
							answerTemplate: entity.answerTemplate as string,
							updatedAt: toDate(entity.updatedAt) ?? new Date(),
						})
						.run();
				} else {
					const incomingMs = getUpdatedAtMs(entity);
					const existingMs = existing.updatedAt.getTime();
					if (incomingMs >= existingMs) {
						await this.db
							.update(cardTemplates)
							.set({
								name: entity.name as string,
								ordinal: entity.ordinal as number,
								questionTemplate: entity.questionTemplate as string,
								answerTemplate: entity.answerTemplate as string,
								updatedAt: toDate(entity.updatedAt) ?? new Date(),
							})
							.where(eq(cardTemplates.id, id))
							.run();
						conflicts.push({
							tableName: "cardTemplates",
							entityId: id,
							winner: "client",
						});
					} else {
						conflicts.push({
							tableName: "cardTemplates",
							entityId: id,
							winner: "server",
						});
					}
				}
			}

			// 3. decks (has userId, updatedAt)
			for (const entity of payload.decks) {
				const id = entity.id as string;
				const existing = await this.db
					.select()
					.from(decks)
					.where(eq(decks.id, id))
					.get();

				if (!existing) {
					await this.db
						.insert(decks)
						.values({
							id,
							userId,
							name: entity.name as string,
							parentId: (entity.parentId as string) ?? null,
							description: (entity.description as string) ?? "",
							settings: entity.settings as
								| {
										newCardsPerDay: number;
										maxReviewsPerDay: number;
								  }
								| undefined,
							createdAt: toDate(entity.createdAt) ?? new Date(),
							updatedAt: toDate(entity.updatedAt) ?? new Date(),
						})
						.run();
				} else {
					const incomingMs = getUpdatedAtMs(entity);
					const existingMs = existing.updatedAt.getTime();
					if (incomingMs >= existingMs) {
						await this.db
							.update(decks)
							.set({
								name: entity.name as string,
								parentId: (entity.parentId as string) ?? existing.parentId,
								description:
									(entity.description as string) ?? existing.description,
								settings:
									(entity.settings as {
										newCardsPerDay: number;
										maxReviewsPerDay: number;
									}) ?? existing.settings,
								updatedAt: toDate(entity.updatedAt) ?? new Date(),
							})
							.where(eq(decks.id, id))
							.run();
						conflicts.push({
							tableName: "decks",
							entityId: id,
							winner: "client",
						});
					} else {
						conflicts.push({
							tableName: "decks",
							entityId: id,
							winner: "server",
						});
					}
				}
			}

			// 4. notes (has userId, updatedAt)
			for (const entity of payload.notes) {
				const id = entity.id as string;
				const existing = await this.db
					.select()
					.from(notes)
					.where(eq(notes.id, id))
					.get();

				if (!existing) {
					await this.db
						.insert(notes)
						.values({
							id,
							userId,
							noteTypeId: entity.noteTypeId as string,
							fields: entity.fields as Record<string, string>,
							tags: (entity.tags as string) ?? "",
							ankiGuid: (entity.ankiGuid as string) ?? null,
							createdAt: toDate(entity.createdAt) ?? new Date(),
							updatedAt: toDate(entity.updatedAt) ?? new Date(),
						})
						.run();
				} else {
					const incomingMs = getUpdatedAtMs(entity);
					const existingMs = existing.updatedAt.getTime();
					if (incomingMs >= existingMs) {
						await this.db
							.update(notes)
							.set({
								fields: entity.fields as Record<string, string>,
								tags: (entity.tags as string) ?? existing.tags,
								updatedAt: toDate(entity.updatedAt) ?? new Date(),
							})
							.where(eq(notes.id, id))
							.run();
						conflicts.push({
							tableName: "notes",
							entityId: id,
							winner: "client",
						});
					} else {
						conflicts.push({
							tableName: "notes",
							entityId: id,
							winner: "server",
						});
					}
				}
			}

			// 5. cards (has updatedAt, no userId)
			for (const entity of payload.cards) {
				const id = entity.id as string;
				const existing = await this.db
					.select()
					.from(cards)
					.where(eq(cards.id, id))
					.get();

				if (!existing) {
					await this.db
						.insert(cards)
						.values({
							id,
							noteId: entity.noteId as string,
							deckId: entity.deckId as string,
							templateId: entity.templateId as string,
							ordinal: entity.ordinal as number,
							due: toDate(entity.due) ?? new Date(),
							stability: (entity.stability as number) ?? 0,
							difficulty: (entity.difficulty as number) ?? 0,
							elapsedDays: (entity.elapsedDays as number) ?? 0,
							scheduledDays: (entity.scheduledDays as number) ?? 0,
							reps: (entity.reps as number) ?? 0,
							lapses: (entity.lapses as number) ?? 0,
							state: (entity.state as number) ?? 0,
							lastReview: toDate(entity.lastReview) ?? null,
							suspended: (entity.suspended as number) ?? 0,
							buriedUntil: toDate(entity.buriedUntil) ?? null,
							createdAt: toDate(entity.createdAt) ?? new Date(),
							updatedAt: toDate(entity.updatedAt) ?? new Date(),
						})
						.run();
				} else {
					const incomingMs = getUpdatedAtMs(entity);
					const existingMs = existing.updatedAt.getTime();
					if (incomingMs >= existingMs) {
						await this.db
							.update(cards)
							.set({
								deckId: entity.deckId as string,
								due: toDate(entity.due) ?? existing.due,
								stability: (entity.stability as number) ?? existing.stability,
								difficulty:
									(entity.difficulty as number) ?? existing.difficulty,
								elapsedDays:
									(entity.elapsedDays as number) ?? existing.elapsedDays,
								scheduledDays:
									(entity.scheduledDays as number) ?? existing.scheduledDays,
								reps: (entity.reps as number) ?? existing.reps,
								lapses: (entity.lapses as number) ?? existing.lapses,
								state: (entity.state as number) ?? existing.state,
								lastReview: toDate(entity.lastReview) ?? existing.lastReview,
								suspended: (entity.suspended as number) ?? existing.suspended,
								buriedUntil: toDate(entity.buriedUntil) ?? existing.buriedUntil,
								updatedAt: toDate(entity.updatedAt) ?? new Date(),
							})
							.where(eq(cards.id, id))
							.run();
						conflicts.push({
							tableName: "cards",
							entityId: id,
							winner: "client",
						});
					} else {
						conflicts.push({
							tableName: "cards",
							entityId: id,
							winner: "server",
						});
					}
				}
			}

			// 6. reviewLogs (append-only: insert if not exists, skip if exists)
			for (const entity of payload.reviewLogs) {
				const id = entity.id as string;
				const existing = await this.db
					.select()
					.from(reviewLogs)
					.where(eq(reviewLogs.id, id))
					.get();

				if (!existing) {
					await this.db
						.insert(reviewLogs)
						.values({
							id,
							cardId: entity.cardId as string,
							rating: entity.rating as number,
							state: entity.state as number,
							due: toDate(entity.due) ?? new Date(),
							stability: entity.stability as number,
							difficulty: entity.difficulty as number,
							elapsedDays: entity.elapsedDays as number,
							lastElapsedDays: entity.lastElapsedDays as number,
							scheduledDays: entity.scheduledDays as number,
							reviewedAt: toDate(entity.reviewedAt) ?? new Date(),
							timeTakenMs: entity.timeTakenMs as number,
						})
						.run();
				}
			}

			// 7. media (content-addressed: insert if hash not exists, skip if exists)
			for (const entity of payload.media) {
				const id = entity.id as string;
				const existing = await this.db
					.select()
					.from(media)
					.where(eq(media.id, id))
					.get();

				if (!existing) {
					await this.db
						.insert(media)
						.values({
							id,
							userId,
							filename: entity.filename as string,
							mimeType: entity.mimeType as string,
							size: entity.size as number,
							createdAt: toDate(entity.createdAt) ?? new Date(),
						})
						.run();
					// Media record was inserted but file may not exist on server yet
					mediaToUpload.push(id);
				}
			}

			// 8. noteMedia (junction: insert if not exists, skip if exists)
			for (const entity of payload.noteMedia) {
				const id = entity.id as string;
				const existing = await this.db
					.select()
					.from(noteMedia)
					.where(eq(noteMedia.id, id))
					.get();

				if (!existing) {
					await this.db
						.insert(noteMedia)
						.values({
							id,
							noteId: entity.noteId as string,
							mediaId: entity.mediaId as string,
						})
						.run();
				}
			}

			// ---- Apply deletions last ----
			// Table name → Drizzle table mapping for deletion lookups
			type AnyTable =
				| typeof decks
				| typeof noteTypes
				| typeof cardTemplates
				| typeof notes
				| typeof cards
				| typeof reviewLogs
				| typeof media
				| typeof noteMedia;
			const tableMap: Record<
				string,
				{ table: AnyTable; hasUpdatedAt: boolean }
			> = {
				decks: { table: decks, hasUpdatedAt: true },
				note_types: { table: noteTypes, hasUpdatedAt: true },
				card_templates: { table: cardTemplates, hasUpdatedAt: true },
				notes: { table: notes, hasUpdatedAt: true },
				cards: { table: cards, hasUpdatedAt: true },
				review_logs: { table: reviewLogs, hasUpdatedAt: false },
				media: { table: media, hasUpdatedAt: false },
				note_media: { table: noteMedia, hasUpdatedAt: false },
			};

			// Sort deletions in reverse FK order to avoid FK constraint violations
			const sortedDeletions = [...payload.deletions].sort((a, b) => {
				const aIndex = DELETION_ORDER.indexOf(a.tableName);
				const bIndex = DELETION_ORDER.indexOf(b.tableName);
				const aOrder = aIndex === -1 ? DELETION_ORDER.length : aIndex;
				const bOrder = bIndex === -1 ? DELETION_ORDER.length : bIndex;
				return aOrder - bOrder;
			});

			for (const tombstone of sortedDeletions) {
				const mapping = tableMap[tombstone.tableName];
				if (!mapping) continue;

				const deletedAtDate = new Date(tombstone.deletedAt);

				// Look up entity by ID
				const existing = await this.db
					.select()
					.from(mapping.table)
					.where(eq(mapping.table.id, tombstone.entityId))
					.get();

				if (existing && mapping.hasUpdatedAt) {
					const existingRecord = existing as Record<string, unknown>;
					const existingUpdatedAt = existingRecord.updatedAt;
					const existingMs =
						existingUpdatedAt instanceof Date
							? existingUpdatedAt.getTime()
							: typeof existingUpdatedAt === "number"
								? existingUpdatedAt
								: 0;
					if (existingMs <= deletedAtDate.getTime()) {
						await this.db
							.delete(mapping.table)
							.where(eq(mapping.table.id, tombstone.entityId))
							.run();
					}
					// If updatedAt > deletedAt, entity was modified after delete — skip
				} else if (existing) {
					// Tables without updatedAt (reviewLogs, media, noteMedia) — always delete
					await this.db
						.delete(mapping.table)
						.where(eq(mapping.table.id, tombstone.entityId))
						.run();
				}

				// Write tombstone to server regardless
				await this.db
					.insert(deletions)
					.values({
						tableName: tombstone.tableName,
						entityId: tombstone.entityId,
						userId,
						deletedAt: deletedAtDate,
					})
					.run();
			}

			await this.db.run(sql`COMMIT`);

			return {
				conflicts,
				mediaToUpload,
				pushedAt: Date.now(),
			};
		} catch (err) {
			await this.db.run(sql`ROLLBACK`);
			throw err;
		}
	}
}
