import { describe, it, expect, expectTypeOf, beforeEach } from "vitest";
import { createTestDb } from "../test-utils";
import { StudyService } from "../../lib/services/study-service";
import { DeckService } from "../../lib/services/deck-service";
import { NoteService } from "../../lib/services/note-service";
import { noteTypes, cardTemplates, cards, reviewLogs } from "../../db/schema";
import { eq } from "drizzle-orm";
import { Rating, State } from "../../lib/fsrs";

type TestDb = ReturnType<typeof createTestDb>;

describe("StudyService", () => {
  let db: TestDb;
  let studyService: StudyService;
  let deckService: DeckService;
  let noteService: NoteService;
  const userId = "user-1";

  // Shared fixtures
  let deckId: number;
  let noteTypeId: number;

  beforeEach(async () => {
    db = createTestDb();
    studyService = new StudyService(db);
    deckService = new DeckService(db);
    noteService = new NoteService(db);

    // Create a deck
    const deck = await deckService.create(userId, { name: "Study Deck" });
    deckId = deck.id;

    // Create a note type with 1 template
    const now = new Date();
    const noteTypeRow = db
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
    noteTypeId = noteTypeRow.id;

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

  describe("getStudySession", () => {
    it("returns cards and counts for a deck", async () => {
      const pastDate = new Date(Date.now() - 60_000);

      // Create notes with cards
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q1", Back: "A1" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q2", Back: "A2" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q3", Back: "A3" },
      });

      // Set cards to different states
      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.deckId, deckId))
        .all();

      await db
        .update(cards)
        .set({ state: 0, due: pastDate })
        .where(eq(cards.id, allCards[0].id));
      await db
        .update(cards)
        .set({ state: 1, due: pastDate })
        .where(eq(cards.id, allCards[1].id));
      await db
        .update(cards)
        .set({ state: 2, due: pastDate })
        .where(eq(cards.id, allCards[2].id));

      const session = await studyService.getStudySession(userId, deckId);

      expect(session.cards).toHaveLength(3);
      expect(session.counts).toStrictEqual({
        new: 1,
        learning: 1,
        review: 1,
      });
    });

    it("returns empty session for a deck with no due cards", async () => {
      const futureDate = new Date(Date.now() + 86_400_000);

      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q1", Back: "A1" },
      });

      // Set card to future due date
      await db
        .update(cards)
        .set({ due: futureDate, state: 0 })
        .where(eq(cards.deckId, deckId));

      const session = await studyService.getStudySession(userId, deckId);

      expect(session.cards).toHaveLength(0);
      // Counts now reflect only due cards
      expect(session.counts.new).toBe(0);
    });
  });

  describe("submitReview", () => {
    it("updates card via FSRS and creates review log entry", async () => {
      const pastDate = new Date(Date.now() - 60_000);

      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q1", Back: "A1" },
      });

      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.noteId, note.id))
        .all();
      const cardId = allCards[0].id;

      // Make card due
      await db
        .update(cards)
        .set({ due: pastDate, state: 0 })
        .where(eq(cards.id, cardId));

      const result = await studyService.submitReview(
        userId,
        cardId,
        Rating.Good,
        5000,
      );

      // Card should have new scheduling data
      expect(result.card.state).toBe(State.Learning);
      expect(result.card.reps).toBe(1);
      expect(result.card.stability).toBeGreaterThan(0);
      expect(result.card.difficulty).toBeGreaterThan(0);
      expect(result.card.lastReview).toBeDefined();

      // Review log should exist
      const logs = await db
        .select()
        .from(reviewLogs)
        .where(eq(reviewLogs.cardId, cardId))
        .all();

      expect(logs).toHaveLength(1);
      expect(logs[0].rating).toBe(Rating.Good);
      expect(logs[0].state).toBe(State.New); // pre-review state
      expect(logs[0].timeTakenMs).toBe(5000);
    });

    it("card has new due date, stability, and difficulty after review", async () => {
      const pastDate = new Date(Date.now() - 60_000);

      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q1", Back: "A1" },
      });

      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.noteId, note.id))
        .all();
      const cardId = allCards[0].id;

      await db
        .update(cards)
        .set({ due: pastDate, state: 0 })
        .where(eq(cards.id, cardId));

      const result = await studyService.submitReview(
        userId,
        cardId,
        Rating.Good,
        3000,
      );

      // Verify data was persisted to DB
      const dbCard = await db
        .select()
        .from(cards)
        .where(eq(cards.id, cardId))
        .get();

      expect(dbCard!.due.getTime()).toBe(result.card.due.getTime());
      expect(dbCard!.stability).toBe(result.card.stability);
      expect(dbCard!.difficulty).toBe(result.card.difficulty);
      expect(dbCard!.reps).toBe(1);
    });

    it("throws error for non-existent card", () => {
      expect(() =>
        studyService.submitReview(userId, 999999, Rating.Good, 1000),
      ).toThrow("Card not found");
    });
  });

  describe("undoLastReview", () => {
    it("restores card to pre-review state and deletes log entry", async () => {
      const pastDate = new Date(Date.now() - 60_000);

      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q1", Back: "A1" },
      });

      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.noteId, note.id))
        .all();
      const cardId = allCards[0].id;

      await db
        .update(cards)
        .set({ due: pastDate, state: 0 })
        .where(eq(cards.id, cardId));

      // Submit a review
      await studyService.submitReview(userId, cardId, Rating.Good, 3000);

      // Verify card changed
      const afterReview = await db
        .select()
        .from(cards)
        .where(eq(cards.id, cardId))
        .get();
      expect(afterReview!.reps).toBe(1);
      expect(afterReview!.state).toBe(State.Learning);

      // Undo
      const restored = await studyService.undoLastReview(userId, cardId);

      expect(restored).toBeDefined();
      expect(restored!.state).toBe(State.New);
      expect(restored!.reps).toBe(0);
      expect(restored!.stability).toBe(0);
      expect(restored!.difficulty).toBe(0);

      // Review log should be deleted
      const logs = await db
        .select()
        .from(reviewLogs)
        .where(eq(reviewLogs.cardId, cardId))
        .all();
      expect(logs).toHaveLength(0);
    });

    it("returns undefined for non-existent card", async () => {
      const result = await studyService.undoLastReview(userId, 999999);
      expect(result).toBeUndefined();
    });

    it("returns undefined when there are no review logs", async () => {
      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q1", Back: "A1" },
      });

      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.noteId, note.id))
        .all();
      const cardId = allCards[0].id;

      const result = await studyService.undoLastReview(userId, cardId);
      expect(result).toBeUndefined();
    });
  });

  describe("sibling burying", () => {
    it("excludes sibling cards from same note after reviewing one", async () => {
      const pastDate = new Date(Date.now() - 60_000);

      // Create a second template for the note type (multi-card note)
      db.insert(cardTemplates)
        .values({
          noteTypeId,
          name: "Card 2",
          ordinal: 1,
          questionTemplate: "{{Back}}",
          answerTemplate: "{{Front}}",
        })
        .returning()
        .get();

      // Create a note (produces 2 cards)
      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q1", Back: "A1" },
      });

      // Set both cards to due
      const noteCards = await db
        .select()
        .from(cards)
        .where(eq(cards.noteId, note.id))
        .all();
      expect(noteCards).toHaveLength(2);

      for (const c of noteCards) {
        await db
          .update(cards)
          .set({ due: pastDate, state: 0 })
          .where(eq(cards.id, c.id));
      }

      // Before review: both cards should appear
      const session1 = studyService.getStudySession(userId, deckId);
      expect(session1.cards).toHaveLength(2);

      // Review the first card
      studyService.submitReview(userId, noteCards[0].id, Rating.Good, 3000);

      // After review: sibling should be buried
      const session2 = studyService.getStudySession(userId, deckId);
      // The reviewed card may come back (learning) but the sibling should not
      const siblingInSession = session2.cards.find(
        (c) => c.id === noteCards[1].id,
      );
      expect(siblingInSession).toBeUndefined();
    });
  });

  describe("pending learning counts", () => {
    it("counts include pending learning cards after review", async () => {
      const pastDate = new Date(Date.now() - 60_000);

      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q1", Back: "A1" },
      });

      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.noteId, note.id))
        .all();
      const cardId = allCards[0].id;

      // Make card due as new
      await db
        .update(cards)
        .set({ due: pastDate, state: 0 })
        .where(eq(cards.id, cardId));

      // Before review: 1 new card
      const session1 = studyService.getStudySession(userId, deckId);
      expect(session1.counts.new).toBe(1);
      expect(session1.counts.learning).toBe(0);

      // Review with Good → card transitions to Learning with future due
      studyService.submitReview(userId, cardId, Rating.Good, 5000);

      // After review: card is now Learning state with future due date
      // It should NOT appear in the cards array (since due > now)
      // but SHOULD be counted in counts.learning
      const session2 = studyService.getStudySession(userId, deckId);
      expect(session2.counts.new).toBe(0);
      expect(session2.counts.learning).toBeGreaterThanOrEqual(1);
    });
  });

  describe("daily limits", () => {
    it("respects daily new card limit across refetches", async () => {
      const pastDate = new Date(Date.now() - 60_000);

      // Create a deck with a low new card limit
      const limitedDeck = await deckService.create(userId, {
        name: "Limited Deck",
      });
      // Update deck settings directly
      const { decks: decksTable } = await import("../../db/schema");
      db.update(decksTable)
        .set({
          settings: { newCardsPerDay: 2, maxReviewsPerDay: 200 },
        })
        .where(eq(decksTable.id, limitedDeck.id))
        .run();

      // Create 5 new cards
      for (let i = 0; i < 5; i += 1) {
        await noteService.create(userId, {
          noteTypeId,
          deckId: limitedDeck.id,
          fields: { Front: `Q${i}`, Back: `A${i}` },
        });
      }

      // Set all cards as due
      db.update(cards)
        .set({ due: pastDate, state: 0 })
        .where(eq(cards.deckId, limitedDeck.id))
        .run();

      // First fetch: should get 2 new cards (limit)
      const session1 = studyService.getStudySession(userId, limitedDeck.id);
      expect(session1.cards).toHaveLength(2);
      expect(session1.counts.new).toBe(2);

      // Review both cards
      for (const card of session1.cards) {
        studyService.submitReview(userId, card.id, Rating.Good, 3000);
      }

      // Second fetch: should get 0 new cards (daily limit exhausted)
      const session2 = studyService.getStudySession(userId, limitedDeck.id);
      // May have learning cards from reviewed cards, but no more new ones
      expect(session2.counts.new).toBe(0);
    });
  });

  describe("card ordering", () => {
    it("returns learning before reviews before new", async () => {
      const pastDate = new Date(Date.now() - 60_000);

      // Create 3 notes
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "New", Back: "A" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Learning", Back: "B" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Review", Back: "C" },
      });

      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.deckId, deckId))
        .all();

      // Set states
      await db
        .update(cards)
        .set({ state: 0, due: pastDate })
        .where(eq(cards.id, allCards[0].id));
      await db
        .update(cards)
        .set({ state: 1, due: pastDate })
        .where(eq(cards.id, allCards[1].id));
      await db
        .update(cards)
        .set({ state: 2, due: pastDate })
        .where(eq(cards.id, allCards[2].id));

      const session = studyService.getStudySession(userId, deckId);

      expect(session.cards).toHaveLength(3);
      // Learning first, then review, then new
      expect(session.cards[0].state).toBe(1); // learning
      expect(session.cards[1].state).toBe(2); // review
      expect(session.cards[2].state).toBe(0); // new
    });
  });

  describe("learning cards bypass limits", () => {
    it("includes learning cards even when review limit is exhausted", async () => {
      const pastDate = new Date(Date.now() - 60_000);

      // Create a deck with review limit of 1
      const limitedDeck = await deckService.create(userId, {
        name: "Tiny Limit",
      });
      const { decks: decksTable } = await import("../../db/schema");
      db.update(decksTable)
        .set({
          settings: { newCardsPerDay: 20, maxReviewsPerDay: 1 },
        })
        .where(eq(decksTable.id, limitedDeck.id))
        .run();

      // Create notes
      await noteService.create(userId, {
        noteTypeId,
        deckId: limitedDeck.id,
        fields: { Front: "Learning", Back: "A" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId: limitedDeck.id,
        fields: { Front: "Review1", Back: "B" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId: limitedDeck.id,
        fields: { Front: "Review2", Back: "C" },
      });

      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.deckId, limitedDeck.id))
        .all();

      // Set states: 1 learning + 2 review
      await db
        .update(cards)
        .set({ state: 1, due: pastDate })
        .where(eq(cards.id, allCards[0].id));
      await db
        .update(cards)
        .set({ state: 2, due: pastDate })
        .where(eq(cards.id, allCards[1].id));
      await db
        .update(cards)
        .set({ state: 2, due: pastDate })
        .where(eq(cards.id, allCards[2].id));

      const session = studyService.getStudySession(userId, limitedDeck.id);

      // Should have learning card + 1 review (limit) = 2 cards
      // Learning card bypasses limits
      const learningCards = session.cards.filter((c) => c.state === 1);
      const reviewCards = session.cards.filter((c) => c.state === 2);

      expect(learningCards).toHaveLength(1);
      expect(reviewCards).toHaveLength(1); // limited to 1
    });
  });

  describe("getIntervalPreviews", () => {
    it("returns previews for all 4 ratings", async () => {
      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Q1", Back: "A1" },
      });

      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.noteId, note.id))
        .all();
      const cardId = allCards[0].id;

      const previews = await studyService.getIntervalPreviews(userId, cardId);

      expect(previews).toBeDefined();
      expect(previews![Rating.Again]).toBeDefined();
      expect(previews![Rating.Hard]).toBeDefined();
      expect(previews![Rating.Good]).toBeDefined();
      expect(previews![Rating.Easy]).toBeDefined();

      // Each preview should have scheduling data
      for (const rating of [
        Rating.Again,
        Rating.Hard,
        Rating.Good,
        Rating.Easy,
      ]) {
        expect(previews![rating].due).toBeInstanceOf(Date);
        expectTypeOf(previews![rating].stability).toBeNumber();
        expectTypeOf(previews![rating].difficulty).toBeNumber();
        expectTypeOf(previews![rating].state).toBeNumber();
      }
    });

    it("returns undefined for non-existent card", async () => {
      const result = await studyService.getIntervalPreviews(userId, 999999);
      expect(result).toBeUndefined();
    });
  });
});
