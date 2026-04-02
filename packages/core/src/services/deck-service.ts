import { and, eq, inArray } from "drizzle-orm";
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
import type { AppFileSystem } from "../filesystem";

type Db = AppDb;

type Deck = typeof decks.$inferSelect;

export type DeckTreeNode = Deck & {
	children: DeckTreeNode[];
};

export class DeckService {
	private db: Db;
	constructor(
		db: Db,
		private mediaDir: string,
		private fs: AppFileSystem,
	) {
		this.db = db;
	}

	async create(
		userId: string,
		data: { name: string; parentId?: string },
	): Promise<Deck> {
		const now = new Date();

		const deck = await this.db
			.insert(decks)
			.values({
				userId,
				name: data.name,
				parentId: data.parentId ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.returning()
			.get();
		return deck;
	}

	async listByUser(userId: string): Promise<Deck[]> {
		return await this.db
			.select()
			.from(decks)
			.where(eq(decks.userId, userId))
			.all();
	}

	async getTree(userId: string): Promise<DeckTreeNode[]> {
		const allDecks = await this.listByUser(userId);
		return buildTree(allDecks);
	}

	async getById(id: string, userId: string): Promise<Deck | undefined> {
		return await this.db
			.select()
			.from(decks)
			.where(and(eq(decks.id, id), eq(decks.userId, userId)))
			.get();
	}

	async update(
		id: string,
		userId: string,
		data: {
			name?: string;
			description?: string;
			parentId?: string | undefined;
			settings?: { newCardsPerDay: number; maxReviewsPerDay: number };
		},
	): Promise<Deck | undefined> {
		const existing = await this.getById(id, userId);
		if (!existing) {
			return undefined;
		}

		await this.db
			.update(decks)
			.set({
				...data,
				updatedAt: new Date(),
			})
			.where(and(eq(decks.id, id), eq(decks.userId, userId)))
			.run();

		return await this.getById(id, userId);
	}

	async delete(id: string, userId: string): Promise<void> {
		const existing = await this.getById(id, userId);
		if (!existing) {
			return;
		}

		// Collect cards in this deck
		const deckCards = await this.db
			.select({ id: cards.id, noteId: cards.noteId })
			.from(cards)
			.where(eq(cards.deckId, id))
			.all();

		if (deckCards.length > 0) {
			const cardIds = deckCards.map((c) => c.id);
			const noteIds = [...new Set(deckCards.map((c) => c.noteId))];

			// Delete review logs for these cards
			await this.db
				.delete(reviewLogs)
				.where(inArray(reviewLogs.cardId, cardIds))
				.run();

			// Delete the cards and write tombstones
			await this.db.delete(cards).where(inArray(cards.id, cardIds)).run();
			for (const cardId of cardIds) {
				await this.db
					.insert(deletions)
					.values({ tableName: "cards", entityId: cardId, userId })
					.run();
			}

			// Find orphaned notes (notes with no remaining cards)
			const orphanedNoteIds: string[] = [];
			for (const noteId of noteIds) {
				const remaining = await this.db
					.select({ id: cards.id })
					.from(cards)
					.where(eq(cards.noteId, noteId))
					.get();
				if (!remaining) {
					orphanedNoteIds.push(noteId);
				}
			}

			if (orphanedNoteIds.length > 0) {
				// Collect media IDs referenced by orphaned notes
				const orphanedRefs = await this.db
					.select({ mediaId: noteMedia.mediaId, id: noteMedia.id })
					.from(noteMedia)
					.where(inArray(noteMedia.noteId, orphanedNoteIds))
					.all();
				const mediaIds = [...new Set(orphanedRefs.map((r) => r.mediaId))];
				const noteMediaIds = orphanedRefs.map((r) => r.id);

				// Delete noteMedia entries for orphaned notes and write tombstones
				await this.db
					.delete(noteMedia)
					.where(inArray(noteMedia.noteId, orphanedNoteIds))
					.run();
				for (const noteMediaId of noteMediaIds) {
					await this.db
						.insert(deletions)
						.values({ tableName: "note_media", entityId: noteMediaId, userId })
						.run();
				}

				// Collect note type IDs from orphaned notes before deleting them
				const orphanedNoteTypeIds = [
					...new Set(
						(
							await this.db
								.select({ noteTypeId: notes.noteTypeId })
								.from(notes)
								.where(inArray(notes.id, orphanedNoteIds))
								.all()
						).map((n) => n.noteTypeId),
					),
				];

				// Delete orphaned notes and write tombstones
				await this.db
					.delete(notes)
					.where(inArray(notes.id, orphanedNoteIds))
					.run();
				for (const noteId of orphanedNoteIds) {
					await this.db
						.insert(deletions)
						.values({ tableName: "notes", entityId: noteId, userId })
						.run();
				}

				// Clean up note types that no longer have any notes
				for (const noteTypeId of orphanedNoteTypeIds) {
					const stillUsed = await this.db
						.select({ id: notes.id })
						.from(notes)
						.where(eq(notes.noteTypeId, noteTypeId))
						.get();

					if (!stillUsed) {
						// Collect templates before deleting
						const templatesToDelete = await this.db
							.select({ id: cardTemplates.id })
							.from(cardTemplates)
							.where(eq(cardTemplates.noteTypeId, noteTypeId))
							.all();

						await this.db
							.delete(cardTemplates)
							.where(eq(cardTemplates.noteTypeId, noteTypeId))
							.run();
						for (const tmpl of templatesToDelete) {
							await this.db
								.insert(deletions)
								.values({
									tableName: "card_templates",
									entityId: tmpl.id,
									userId,
								})
								.run();
						}

						await this.db
							.delete(noteTypes)
							.where(eq(noteTypes.id, noteTypeId))
							.run();
						await this.db
							.insert(deletions)
							.values({ tableName: "note_types", entityId: noteTypeId, userId })
							.run();
					}
				}

				// Clean up media that are now unreferenced
				for (const mediaId of mediaIds) {
					const stillReferenced = await this.db
						.select({ id: noteMedia.id })
						.from(noteMedia)
						.where(eq(noteMedia.mediaId, mediaId))
						.get();

					if (!stillReferenced) {
						const mediaRecord = await this.db
							.select()
							.from(media)
							.where(eq(media.id, mediaId))
							.get();

						if (mediaRecord) {
							const filePath = this.fs.join(
								this.mediaDir,
								mediaRecord.filename,
							);
							try {
								if (await this.fs.exists(filePath)) {
									await this.fs.unlink(filePath);
								}
							} catch {
								// File may already be gone
							}
							await this.db.delete(media).where(eq(media.id, mediaId)).run();
							await this.db
								.insert(deletions)
								.values({ tableName: "media", entityId: mediaId, userId })
								.run();
						}
					}
				}
			}
		}

		// Re-parent children to the deleted deck's parent
		await this.db
			.update(decks)
			.set({ parentId: existing.parentId })
			.where(and(eq(decks.parentId, id), eq(decks.userId, userId)))
			.run();

		// Delete the deck and write tombstone
		await this.db
			.delete(decks)
			.where(and(eq(decks.id, id), eq(decks.userId, userId)))
			.run();
		await this.db
			.insert(deletions)
			.values({ tableName: "decks", entityId: id, userId })
			.run();
	}
}

function buildTree(flatDecks: Deck[]): DeckTreeNode[] {
	const nodeMap = new Map<string, DeckTreeNode>();

	// Create nodes with empty children arrays
	for (const deck of flatDecks) {
		nodeMap.set(deck.id, { ...deck, children: [] });
	}

	const roots: DeckTreeNode[] = [];

	// Build parent-child relationships
	for (const deck of flatDecks) {
		const node = nodeMap.get(deck.id)!;
		if (deck.parentId && nodeMap.has(deck.parentId)) {
			nodeMap.get(deck.parentId)?.children.push(node);
		} else {
			roots.push(node);
		}
	}

	return sortTree(roots);
}

function sortTree(nodes: DeckTreeNode[]): DeckTreeNode[] {
	nodes.sort((a, b) => a.name.localeCompare(b.name));
	for (const node of nodes) {
		sortTree(node.children);
	}
	return nodes;
}
