import { describe, it, expect, expectTypeOf, beforeEach } from "vitest";
import { createTestDb } from "../test-utils";
import { StudyService } from "../../lib/services/study-service";
import { DeckService } from "../../lib/services/deck-service";
import { NoteService } from "../../lib/services/note-service";
import { generateId } from "../../lib/id";
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
  let deckId: string;
  let noteTypeId: string;
  let templateId: string;

  beforeEach(async () => {
    db = createTestDb();
    studyService = new StudyService(db);
    deckService = new DeckService(db);
    noteService = new NoteService(db);

    // Create a deck
    const deck = await deckService.create(userId, { name: "Study Deck" });
    deckId = deck.id;

    // Create a note type with 1 template
    noteTypeId = generateId();
    const now = new Date();
    await db.insert(noteTypes).values({
      id: noteTypeId,
      userId,
      name: "Basic",
      fields: [
        { name: "Front", ordinal: 0 },
        { name: "Back", ordinal: 1 },
      ],
      createdAt: now,
      updatedAt: now,
    });

    templateId = generateId();
    await db.insert(cardTemplates).values({
      id: templateId,
      noteTypeId,
      name: "Card 1",
      ordinal: 0,
      questionTemplate: "{{Front}}",
      answerTemplate: "{{Back}}",
    });
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
      // Counts reflect total cards in deck regardless of due
      expect(session.counts.new).toBe(1);
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
        studyService.submitReview(userId, "nonexistent", Rating.Good, 1000),
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
      const result = await studyService.undoLastReview(userId, "nonexistent");
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
      const result = await studyService.getIntervalPreviews(
        userId,
        "nonexistent",
      );
      expect(result).toBeUndefined();
    });
  });
});
