import { nodeFs } from "@swanki/core/node-filesystem";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { cards, cardTemplates, noteTypes } from "../../db/schema";
import { DeckService } from "../../lib/services/deck-service";
import { NoteService } from "../../lib/services/note-service";
import { createTestDb, testMediaDir } from "../test-utils";

type TestDb = ReturnType<typeof createTestDb>;

describe("NoteService", () => {
	let db: TestDb;
	let noteService: NoteService;
	let deckService: DeckService;
	const userId = "user-1";

	// Shared fixtures
	let deckId: number;
	let noteTypeId: number;
	let templateIds: number[];

	beforeEach(async () => {
		db = createTestDb();
		noteService = new NoteService(db);
		deckService = new DeckService(db, testMediaDir, nodeFs);

		// Create a deck
		const deck = await deckService.create(userId, { name: "Test Deck" });
		deckId = deck.id;

		// Create a note type with 2 templates
		const now = new Date();
		const noteType = db
			.insert(noteTypes)
			.values({
				userId,
				name: "Basic (and reversed)",
				fields: [
					{ name: "Front", ordinal: 0 },
					{ name: "Back", ordinal: 1 },
				],
				createdAt: now,
				updatedAt: now,
			})
			.returning()
			.get();
		noteTypeId = noteType.id;

		const templates = [
			db
				.insert(cardTemplates)
				.values({
					noteTypeId,
					name: "Card 1",
					ordinal: 0,
					questionTemplate: "{{Front}}",
					answerTemplate: "{{Back}}",
				})
				.returning()
				.get(),
			db
				.insert(cardTemplates)
				.values({
					noteTypeId,
					name: "Card 2",
					ordinal: 1,
					questionTemplate: "{{Back}}",
					answerTemplate: "{{Front}}",
				})
				.returning()
				.get(),
		];
		templateIds = [templates[0].id, templates[1].id];
	});

	describe("create", () => {
		it("creates a note with correct fields", async () => {
			const note = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			expect(note).toBeDefined();
			expect(note.id).toBeDefined();
			expect(note.userId).toBe(userId);
			expect(note.noteTypeId).toBe(noteTypeId);
			expect(note.fields).toStrictEqual({ Front: "Hello", Back: "World" });
			expect(note.createdAt).toBeInstanceOf(Date);
			expect(note.updatedAt).toBeInstanceOf(Date);
		});

		it("auto-generates cards (1 card per template in the note type)", async () => {
			const note = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			const generatedCards = await db
				.select()
				.from(cards)
				.where(eq(cards.noteId, note.id))
				.all();

			expect(generatedCards).toHaveLength(2);

			for (const card of generatedCards) {
				expect(card.deckId).toBe(deckId);
				expect(card.noteId).toBe(note.id);
				expect(card.state).toBe(0); // new
				expect(card.due).toBeInstanceOf(Date);
			}
		});

		it("with 2 templates, creates 2 cards with correct template and ordinal", async () => {
			const note = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			const generatedCards = await db
				.select()
				.from(cards)
				.where(eq(cards.noteId, note.id))
				.all();

			expect(generatedCards).toHaveLength(2);

			const sorted = generatedCards.toSorted((a, b) => a.ordinal - b.ordinal);
			expect(sorted[0].templateId).toBe(templateIds[0]);
			expect(sorted[0].ordinal).toBe(0);
			expect(sorted[1].templateId).toBe(templateIds[1]);
			expect(sorted[1].ordinal).toBe(1);
		});

		it("creates a note with tags", async () => {
			const note = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
				tags: "vocabulary language",
			});

			expect(note.tags).toBe("vocabulary language");
		});

		it("creates 1 card when note type has 1 template", async () => {
			// Create a single-template note type
			const now = new Date();
			const singleType = db
				.insert(noteTypes)
				.values({
					userId,
					name: "Basic",
					fields: [
						{ name: "Front", ordinal: 0 },
						{ name: "Back", ordinal: 1 },
					],
					createdAt: now,
					updatedAt: now,
				})
				.returning()
				.get();

			const singleTemplate = db
				.insert(cardTemplates)
				.values({
					noteTypeId: singleType.id,
					name: "Card 1",
					ordinal: 0,
					questionTemplate: "{{Front}}",
					answerTemplate: "{{Back}}",
				})
				.returning()
				.get();

			const note = await noteService.create(userId, {
				noteTypeId: singleType.id,
				deckId,
				fields: { Front: "Q", Back: "A" },
			});

			const generatedCards = await db
				.select()
				.from(cards)
				.where(eq(cards.noteId, note.id))
				.all();

			expect(generatedCards).toHaveLength(1);
			expect(generatedCards[0].templateId).toBe(singleTemplate.id);
		});
	});

	describe("getById", () => {
		it("returns note with its cards", async () => {
			const created = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			const result = await noteService.getById(created.id, userId);

			expect(result).toBeDefined();
			expect(result?.note.id).toBe(created.id);
			expect(result?.note.fields).toStrictEqual({
				Front: "Hello",
				Back: "World",
			});
			expect(result?.cards).toHaveLength(2);
		});

		it("returns undefined for wrong user", async () => {
			const created = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			const result = await noteService.getById(created.id, "wrong-user");
			expect(result).toBeUndefined();
		});

		it("returns undefined for non-existent id", async () => {
			const result = await noteService.getById(999999, userId);
			expect(result).toBeUndefined();
		});
	});

	describe("update", () => {
		it("updates note fields", async () => {
			const created = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			const updated = await noteService.update(created.id, userId, {
				fields: { Front: "Updated", Back: "Fields" },
			});

			expect(updated).toBeDefined();
			expect(updated?.fields).toStrictEqual({
				Front: "Updated",
				Back: "Fields",
			});
		});

		it("updates note tags", async () => {
			const created = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
				tags: "old-tag",
			});

			const updated = await noteService.update(created.id, userId, {
				tags: "new-tag updated",
			});

			expect(updated).toBeDefined();
			expect(updated?.tags).toBe("new-tag updated");
		});

		it("returns undefined for wrong user", async () => {
			const created = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			const updated = await noteService.update(created.id, "wrong-user", {
				fields: { Front: "Nope", Back: "Nope" },
			});

			expect(updated).toBeUndefined();
		});
	});

	describe("delete", () => {
		it("deletes note AND all its cards", async () => {
			const created = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			await noteService.delete(created.id, userId);

			const note = await noteService.getById(created.id, userId);
			expect(note).toBeUndefined();

			const remainingCards = await db
				.select()
				.from(cards)
				.where(eq(cards.noteId, created.id))
				.all();
			expect(remainingCards).toHaveLength(0);
		});

		it("does nothing for wrong user", async () => {
			const created = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			await noteService.delete(created.id, "wrong-user");

			const note = await noteService.getById(created.id, userId);
			expect(note).toBeDefined();
		});
	});

	describe("listByDeck", () => {
		it("returns notes that have cards in the given deck", async () => {
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Note 1", Back: "Answer 1" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Note 2", Back: "Answer 2" },
			});

			// Create another deck with a note
			const otherDeck = await deckService.create(userId, {
				name: "Other Deck",
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId: otherDeck.id,
				fields: { Front: "Other Note", Back: "Other Answer" },
			});

			const notes = await noteService.listByDeck(deckId, userId);

			expect(notes).toHaveLength(2);
			const fronts = notes.map((n) => n.fields.Front).toSorted();
			expect(fronts).toStrictEqual(["Note 1", "Note 2"]);
		});

		it("returns empty array for deck with no notes", async () => {
			const emptyDeck = await deckService.create(userId, {
				name: "Empty Deck",
			});
			const notes = await noteService.listByDeck(emptyDeck.id, userId);
			expect(notes).toHaveLength(0);
		});
	});

	describe("search", () => {
		it("finds notes matching query in fields", async () => {
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Apple", Back: "A fruit" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Banana", Back: "Another fruit" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Car", Back: "A vehicle" },
			});

			const results = await noteService.search(userId, "fruit");

			expect(results).toHaveLength(2);
			const fronts = results.map((n) => n.fields.Front).toSorted();
			expect(fronts).toStrictEqual(["Apple", "Banana"]);
		});

		it("returns empty array when no matches", async () => {
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			const results = await noteService.search(userId, "xyz-no-match");
			expect(results).toHaveLength(0);
		});

		it("does not return notes from other users", async () => {
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Secret", Back: "Data" },
			});

			const results = await noteService.search("other-user", "Secret");
			expect(results).toHaveLength(0);
		});
	});
});
