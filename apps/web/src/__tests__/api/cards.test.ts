import { nodeFs } from "@swanki/core/node-filesystem";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { cards, cardTemplates, decks, noteTypes } from "../../db/schema";
import { CardService } from "../../lib/services/card-service";
import { DeckService } from "../../lib/services/deck-service";
import { NoteService } from "../../lib/services/note-service";
import { createTestDb, testMediaDir } from "../test-utils";

type TestDb = ReturnType<typeof createTestDb>;

describe("CardService", () => {
	let db: TestDb;
	let cardService: CardService;
	let deckService: DeckService;
	let noteService: NoteService;
	const userId = "user-1";

	// Shared fixtures
	let deckId: number;
	let noteTypeId: number;

	beforeEach(async () => {
		db = createTestDb();
		cardService = new CardService(db);
		deckService = new DeckService(db, testMediaDir, nodeFs);
		noteService = new NoteService(db);

		// Create a deck
		const deck = await deckService.create(userId, { name: "Test Deck" });
		deckId = deck.id;

		// Create a note type with 1 template
		const now = new Date();
		const noteType = db
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
		noteTypeId = noteType.id;

		db.insert(cardTemplates)
			.values({
				noteTypeId,
				name: "Card 1",
				ordinal: 0,
				questionTemplate: "{{Front}}",
				answerTemplate: "{{Back}}",
			})
			.run();
	});

	describe("getDueCards", () => {
		it("returns cards that are due (due <= now)", async () => {
			const now = new Date();
			const pastDate = new Date(now.getTime() - 60_000); // 1 minute ago
			const futureDate = new Date(now.getTime() + 86_400_000); // 1 day from now

			// Create note with a card (auto-created by NoteService)
			const note1 = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Due card", Back: "Answer 1" },
			});

			const note2 = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Future card", Back: "Answer 2" },
			});

			// Get the auto-created cards and adjust their due dates
			const allCards = await db.select().from(cards).all();
			const card1 = allCards.find((c) => c.noteId === note1.id);
			if (!card1) throw new Error("Expected card for note1");
			const card2 = allCards.find((c) => c.noteId === note2.id);
			if (!card2) throw new Error("Expected card for note2");

			await db
				.update(cards)
				.set({ due: pastDate, state: 0 })
				.where(eq(cards.id, card1.id));

			await db
				.update(cards)
				.set({ due: futureDate, state: 0 })
				.where(eq(cards.id, card2.id));

			const dueCards = await cardService.getDueCards(userId, deckId);

			expect(dueCards).toHaveLength(1);
			expect(dueCards[0].id).toBe(card1.id);
		});

		it("orders: learning first, then overdue reviews, then new cards", async () => {
			const now = new Date();
			const pastDate = new Date(now.getTime() - 86_400_000); // 1 day ago

			// Create 3 notes (each auto-creates 1 card)
			const noteNew = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "New card", Back: "A" },
			});
			const noteLearning = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Learning card", Back: "B" },
			});
			const noteReview = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Review card", Back: "C" },
			});

			const allCards = await db.select().from(cards).all();
			const cardNew = allCards.find((c) => c.noteId === noteNew.id);
			if (!cardNew) throw new Error("Expected card for noteNew");
			const cardLearning = allCards.find((c) => c.noteId === noteLearning.id);
			if (!cardLearning) throw new Error("Expected card for noteLearning");
			const cardReview = allCards.find((c) => c.noteId === noteReview.id);
			if (!cardReview) throw new Error("Expected card for noteReview");

			// Set states and due dates
			await db
				.update(cards)
				.set({ state: 0, due: pastDate }) // new, due
				.where(eq(cards.id, cardNew.id));

			await db
				.update(cards)
				.set({ state: 1, due: pastDate }) // learning, due
				.where(eq(cards.id, cardLearning.id));

			await db
				.update(cards)
				.set({ state: 2, due: pastDate }) // review (overdue), due
				.where(eq(cards.id, cardReview.id));

			const dueCards = await cardService.getDueCards(userId, deckId);

			expect(dueCards).toHaveLength(3);
			// Order: learning (state=1) first, then reviews (state=2, shuffled), then new (state=0)
			expect(dueCards[0].id).toBe(cardLearning.id);
			expect(dueCards[1].id).toBe(cardReview.id);
			expect(dueCards[2].id).toBe(cardNew.id);
		});

		it("respects deck's newCardsPerDay limit for new cards", async () => {
			// Update deck to limit new cards to 1 per day
			await db
				.update(decks)
				.set({
					settings: { newCardsPerDay: 1, maxReviewsPerDay: 200 },
				})
				.where(eq(decks.id, deckId));

			const now = new Date();
			const pastDate = new Date(now.getTime() - 60_000);

			// Create 3 notes (each auto-creates 1 new card)
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "New 1", Back: "A" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "New 2", Back: "B" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "New 3", Back: "C" },
			});

			// Set all cards as due (state=0 is new)
			await db
				.update(cards)
				.set({ due: pastDate, state: 0 })
				.where(eq(cards.deckId, deckId));

			const dueCards = await cardService.getDueCards(userId, deckId);

			// Should only return 1 new card due to limit
			expect(dueCards).toHaveLength(1);
		});

		it("respects deck's maxReviewsPerDay limit for review cards", async () => {
			// Update deck to limit reviews to 1 per day
			await db
				.update(decks)
				.set({
					settings: { newCardsPerDay: 20, maxReviewsPerDay: 1 },
				})
				.where(eq(decks.id, deckId));

			const now = new Date();
			const pastDate = new Date(now.getTime() - 60_000);

			// Create 3 notes
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Review 1", Back: "A" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Review 2", Back: "B" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Review 3", Back: "C" },
			});

			// Set all cards as review cards that are due
			await db
				.update(cards)
				.set({ due: pastDate, state: 2 })
				.where(eq(cards.deckId, deckId));

			const dueCards = await cardService.getDueCards(userId, deckId);

			// Should only return 1 review card due to limit
			expect(dueCards).toHaveLength(1);
		});

		it("with includeChildren=true includes cards from child decks", async () => {
			// Create child deck
			const childDeck = await deckService.create(userId, {
				name: "Child Deck",
				parentId: deckId,
			});

			const now = new Date();
			const pastDate = new Date(now.getTime() - 60_000);

			// Create note in parent deck
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Parent card", Back: "A" },
			});

			// Create note in child deck
			await noteService.create(userId, {
				noteTypeId,
				deckId: childDeck.id,
				fields: { Front: "Child card", Back: "B" },
			});

			// Set all cards as due
			await db.update(cards).set({ due: pastDate, state: 0 });

			const dueCards = await cardService.getDueCards(userId, deckId, {
				includeChildren: true,
			});

			expect(dueCards).toHaveLength(2);
			const fronts = dueCards.map((c) => c.noteFields.Front).toSorted();
			expect(fronts).toStrictEqual(["Child card", "Parent card"]);
		});
	});

	describe("getById", () => {
		it("returns card with note data", async () => {
			const note = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			const allCards = await db
				.select()
				.from(cards)
				.where(eq(cards.noteId, note.id))
				.all();
			const cardId = allCards[0].id;

			const result = await cardService.getById(cardId, userId);

			expect(result).toBeDefined();
			expect(result?.id).toBe(cardId);
			expect(result?.noteId).toBe(note.id);
			expect(result?.noteFields).toStrictEqual({
				Front: "Hello",
				Back: "World",
			});
		});

		it("returns undefined for wrong user", async () => {
			const note = await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Hello", Back: "World" },
			});

			const allCards = await db
				.select()
				.from(cards)
				.where(eq(cards.noteId, note.id))
				.all();
			const cardId = allCards[0].id;

			const result = await cardService.getById(cardId, "wrong-user");

			expect(result).toBeUndefined();
		});
	});

	describe("moveToDeck", () => {
		it("updates deckId for specified cards", async () => {
			const newDeck = await deckService.create(userId, {
				name: "Target Deck",
			});

			// Create 2 notes in original deck
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Card 1", Back: "A" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Card 2", Back: "B" },
			});

			const allCards = await db
				.select()
				.from(cards)
				.where(eq(cards.deckId, deckId))
				.all();
			const cardIds = allCards.map((c) => c.id);

			await cardService.moveToDeck(cardIds, newDeck.id, userId);

			// Verify cards moved
			const movedCards = await db
				.select()
				.from(cards)
				.where(eq(cards.deckId, newDeck.id))
				.all();

			expect(movedCards).toHaveLength(2);
			for (const card of movedCards) {
				expect(card.deckId).toBe(newDeck.id);
			}

			// Original deck should have no cards
			const originalCards = await db
				.select()
				.from(cards)
				.where(eq(cards.deckId, deckId))
				.all();
			expect(originalCards).toHaveLength(0);
		});
	});

	describe("getCounts", () => {
		it("returns { new, learning, review } counts", async () => {
			const now = new Date();
			const pastDate = new Date(now.getTime() - 60_000);

			// Create 4 notes => 4 cards
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "New 1", Back: "A" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "New 2", Back: "B" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Learning", Back: "C" },
			});
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Review", Back: "D" },
			});

			const allCards = await db
				.select()
				.from(cards)
				.where(eq(cards.deckId, deckId))
				.all();

			// Set different states
			await db
				.update(cards)
				.set({ state: 0, due: pastDate })
				.where(eq(cards.id, allCards[0].id));
			await db
				.update(cards)
				.set({ state: 0, due: pastDate })
				.where(eq(cards.id, allCards[1].id));
			await db
				.update(cards)
				.set({ state: 1, due: pastDate })
				.where(eq(cards.id, allCards[2].id));
			await db
				.update(cards)
				.set({ state: 2, due: pastDate })
				.where(eq(cards.id, allCards[3].id));

			const counts = await cardService.getCounts(userId, deckId);

			expect(counts).toStrictEqual({
				new: 2,
				learning: 1,
				review: 1,
			});
		});
	});

	describe("suspend and bury", () => {
		it("excludes suspended cards from getDueCards", async () => {
			const pastDate = new Date(Date.now() - 60_000);
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Q1", Back: "A1" },
			});
			// Set card to due and suspended
			db.update(cards)
				.set({ due: pastDate, state: 0, suspended: 1 })
				.where(eq(cards.deckId, deckId))
				.run();

			const due = await cardService.getDueCards(userId, deckId);
			expect(due).toHaveLength(0);
		});

		it("excludes buried cards from getDueCards", async () => {
			const pastDate = new Date(Date.now() - 60_000);
			const futureBury = new Date(Date.now() + 86_400_000); // tomorrow
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Q1", Back: "A1" },
			});
			db.update(cards)
				.set({ due: pastDate, state: 0, buriedUntil: futureBury })
				.where(eq(cards.deckId, deckId))
				.run();

			const due = await cardService.getDueCards(userId, deckId);
			expect(due).toHaveLength(0);
		});

		it("includes cards whose buriedUntil has passed", async () => {
			const pastDate = new Date(Date.now() - 60_000);
			const pastBury = new Date(Date.now() - 1000); // already past
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Q1", Back: "A1" },
			});
			db.update(cards)
				.set({ due: pastDate, state: 0, buriedUntil: pastBury })
				.where(eq(cards.deckId, deckId))
				.run();

			const due = await cardService.getDueCards(userId, deckId);
			expect(due).toHaveLength(1);
		});

		it("suspendCards sets suspended=1 for owned cards", async () => {
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Q1", Back: "A1" },
			});
			const allCards = await db
				.select()
				.from(cards)
				.where(eq(cards.deckId, deckId))
				.all();
			const cardId = allCards[0].id;

			await cardService.suspendCards([cardId], userId, true);

			const updated = await db
				.select()
				.from(cards)
				.where(eq(cards.id, cardId))
				.get();
			expect(updated?.suspended).toBe(1);

			// Unsuspend
			await cardService.suspendCards([cardId], userId, false);
			const restored = await db
				.select()
				.from(cards)
				.where(eq(cards.id, cardId))
				.get();
			expect(restored?.suspended).toBe(0);
		});

		it("buryCards sets buriedUntil to next midnight", async () => {
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Q1", Back: "A1" },
			});
			const allCards = await db
				.select()
				.from(cards)
				.where(eq(cards.deckId, deckId))
				.all();
			const cardId = allCards[0].id;

			const before = Date.now();
			await cardService.buryCards([cardId], userId);

			const updated = await db
				.select()
				.from(cards)
				.where(eq(cards.id, cardId))
				.get();
			expect(updated?.buriedUntil).not.toBeNull();
			expect(updated?.buriedUntil?.getTime()).toBeGreaterThan(before);
		});

		it("unburyCards clears buriedUntil", async () => {
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Q1", Back: "A1" },
			});
			const allCards = await db
				.select()
				.from(cards)
				.where(eq(cards.deckId, deckId))
				.all();
			const cardId = allCards[0].id;

			await cardService.buryCards([cardId], userId);
			await cardService.unburyCards([cardId], userId);

			const updated = await db
				.select()
				.from(cards)
				.where(eq(cards.id, cardId))
				.get();
			expect(updated?.buriedUntil).toBeNull();
		});

		it("suspendCards ignores cards from another user", async () => {
			await noteService.create(userId, {
				noteTypeId,
				deckId,
				fields: { Front: "Q1", Back: "A1" },
			});
			const allCards = await db
				.select()
				.from(cards)
				.where(eq(cards.deckId, deckId))
				.all();
			const cardId = allCards[0].id;

			await cardService.suspendCards([cardId], "other-user", true);

			const updated = await db
				.select()
				.from(cards)
				.where(eq(cards.id, cardId))
				.get();
			expect(updated?.suspended).toBe(0); // unchanged
		});
	});
});
