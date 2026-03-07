import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../test-utils";
import { StatsService } from "../../lib/services/stats-service";
import { DeckService } from "../../lib/services/deck-service";
import { NoteService } from "../../lib/services/note-service";
import { generateId } from "../../lib/id";
import { noteTypes, cardTemplates, cards, reviewLogs } from "../../db/schema";
import { eq } from "drizzle-orm";

type TestDb = ReturnType<typeof createTestDb>;

describe("StatsService", () => {
  let db: TestDb;
  let statsService: StatsService;
  let deckService: DeckService;
  let noteService: NoteService;
  const userId = "user-1";

  // Shared fixtures
  let deckId: string;
  let noteTypeId: string;
  let templateId: string;

  beforeEach(async () => {
    db = createTestDb();
    statsService = new StatsService(db);
    deckService = new DeckService(db);
    noteService = new NoteService(db);

    // Create a deck
    const deck = await deckService.create(userId, { name: "Stats Deck" });
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

  /** Helper: create a note (which auto-creates a card) and return the card ID */
  async function createCard(front: string, back: string): Promise<string> {
    const note = await noteService.create(userId, {
      noteTypeId,
      deckId,
      fields: { Front: front, Back: back },
    });
    const allCards = await db
      .select()
      .from(cards)
      .where(eq(cards.noteId, note.id))
      .all();
    return allCards[0].id;
  }

  /** Helper: insert a review log for a given card at a specific date */
  async function addReviewLog(cardId: string, reviewedAt: Date): Promise<void> {
    await db.insert(reviewLogs).values({
      id: generateId(),
      cardId,
      rating: 3,
      state: 0,
      due: reviewedAt,
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      lastElapsedDays: 0,
      scheduledDays: 1,
      reviewedAt,
      timeTakenMs: 3000,
    });
  }

  /** Helper: create a Date at midnight UTC for a given offset in days from today */
  function daysAgo(n: number): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - n);
    return d;
  }

  describe("getReviewsPerDay", () => {
    it("returns array of { date, count } for last N days", async () => {
      const cardId = await createCard("Q1", "A1");

      // Add reviews on different days
      await addReviewLog(cardId, daysAgo(0)); // today
      await addReviewLog(cardId, daysAgo(0)); // today (second review)
      await addReviewLog(cardId, daysAgo(1)); // yesterday
      await addReviewLog(cardId, daysAgo(5)); // 5 days ago

      const result = await statsService.getReviewsPerDay(userId, 7);

      // Should return 7 entries (one per day)
      expect(result).toHaveLength(7);

      // Find today's entry
      const todayStr = daysAgo(0).toISOString().split("T")[0];
      const todayEntry = result.find((r) => r.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry!.count).toBe(2);

      // Find yesterday's entry
      const yesterdayStr = daysAgo(1).toISOString().split("T")[0];
      const yesterdayEntry = result.find((r) => r.date === yesterdayStr);
      expect(yesterdayEntry).toBeDefined();
      expect(yesterdayEntry!.count).toBe(1);

      // Find 5-days-ago entry
      const fiveDaysAgoStr = daysAgo(5).toISOString().split("T")[0];
      const fiveDaysEntry = result.find((r) => r.date === fiveDaysAgoStr);
      expect(fiveDaysEntry).toBeDefined();
      expect(fiveDaysEntry!.count).toBe(1);

      // Days with no reviews should have count 0
      const twoDaysAgoStr = daysAgo(2).toISOString().split("T")[0];
      const twoDaysEntry = result.find((r) => r.date === twoDaysAgoStr);
      expect(twoDaysEntry).toBeDefined();
      expect(twoDaysEntry!.count).toBe(0);
    });

    it("excludes reviews from other users", async () => {
      const cardId = await createCard("Q1", "A1");
      await addReviewLog(cardId, daysAgo(0));

      // Create a card for another user
      const otherDeck = await deckService.create("user-2", {
        name: "Other Deck",
      });
      const otherNoteTypeId = generateId();
      await db.insert(noteTypes).values({
        id: otherNoteTypeId,
        userId: "user-2",
        name: "Other Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const otherTemplateId = generateId();
      await db.insert(cardTemplates).values({
        id: otherTemplateId,
        noteTypeId: otherNoteTypeId,
        name: "Card 1",
        ordinal: 0,
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });
      const otherNote = await noteService.create("user-2", {
        noteTypeId: otherNoteTypeId,
        deckId: otherDeck.id,
        fields: { Front: "Other Q", Back: "Other A" },
      });
      const otherCards = await db
        .select()
        .from(cards)
        .where(eq(cards.noteId, otherNote.id))
        .all();
      await addReviewLog(otherCards[0].id, daysAgo(0));

      const result = await statsService.getReviewsPerDay(userId, 7);
      const todayStr = daysAgo(0).toISOString().split("T")[0];
      const todayEntry = result.find((r) => r.date === todayStr);
      expect(todayEntry!.count).toBe(1); // Only user-1's review
    });

    it("returns empty counts when no reviews exist", async () => {
      const result = await statsService.getReviewsPerDay(userId, 7);
      expect(result).toHaveLength(7);
      for (const entry of result) {
        expect(entry.count).toBe(0);
      }
    });
  });

  describe("getCardStates", () => {
    it("returns { new, learning, review, relearning } counts", async () => {
      const card1Id = await createCard("Q1", "A1");
      const card2Id = await createCard("Q2", "A2");
      const card3Id = await createCard("Q3", "A3");
      const card4Id = await createCard("Q4", "A4");

      // Set states: 0=new, 1=learning, 2=review, 3=relearning
      await db.update(cards).set({ state: 0 }).where(eq(cards.id, card1Id));
      await db.update(cards).set({ state: 1 }).where(eq(cards.id, card2Id));
      await db.update(cards).set({ state: 2 }).where(eq(cards.id, card3Id));
      await db.update(cards).set({ state: 3 }).where(eq(cards.id, card4Id));

      const result = await statsService.getCardStates(userId);

      expect(result).toStrictEqual({
        new: 1,
        learning: 1,
        review: 1,
        relearning: 1,
      });
    });

    it("returns zeros when user has no cards", async () => {
      const result = await statsService.getCardStates("no-cards-user");

      expect(result).toStrictEqual({
        new: 0,
        learning: 0,
        review: 0,
        relearning: 0,
      });
    });
  });

  describe("getStreak", () => {
    it("returns { current, longest } based on days with reviews", async () => {
      const cardId = await createCard("Q1", "A1");

      // Create a streak of 3 consecutive days (today, yesterday, 2 days ago)
      await addReviewLog(cardId, daysAgo(0));
      await addReviewLog(cardId, daysAgo(1));
      await addReviewLog(cardId, daysAgo(2));

      const result = await statsService.getStreak(userId);

      expect(result.current).toBe(3);
      expect(result.longest).toBe(3);
    });

    it("returns 0 current when no reviews today", async () => {
      const cardId = await createCard("Q1", "A1");

      // Reviews only yesterday and 2 days ago
      await addReviewLog(cardId, daysAgo(1));
      await addReviewLog(cardId, daysAgo(2));

      const result = await statsService.getStreak(userId);

      expect(result.current).toBe(0);
      expect(result.longest).toBe(2);
    });

    it("handles gaps in review days correctly", async () => {
      const cardId = await createCard("Q1", "A1");

      // Streak: today, yesterday (2 days)
      // Gap: 2 days ago
      // Old streak: 3, 4, 5 days ago (3 days)
      await addReviewLog(cardId, daysAgo(0));
      await addReviewLog(cardId, daysAgo(1));
      // gap at daysAgo(2)
      await addReviewLog(cardId, daysAgo(3));
      await addReviewLog(cardId, daysAgo(4));
      await addReviewLog(cardId, daysAgo(5));

      const result = await statsService.getStreak(userId);

      expect(result.current).toBe(2);
      expect(result.longest).toBe(3);
    });

    it("returns { current: 0, longest: 0 } when no reviews", async () => {
      const result = await statsService.getStreak(userId);

      expect(result).toStrictEqual({ current: 0, longest: 0 });
    });
  });

  describe("getHeatmap", () => {
    it("returns map of date to review count for the year", async () => {
      const cardId = await createCard("Q1", "A1");

      // Add reviews on specific dates in 2026
      const jan1 = new Date("2026-01-01T12:00:00Z");
      const jan2 = new Date("2026-01-02T12:00:00Z");
      const mar5 = new Date("2026-03-05T12:00:00Z");

      await addReviewLog(cardId, jan1);
      await addReviewLog(cardId, jan1); // 2 reviews on Jan 1
      await addReviewLog(cardId, jan2);
      await addReviewLog(cardId, mar5);

      const result = await statsService.getHeatmap(userId, 2026);

      expect(result["2026-01-01"]).toBe(2);
      expect(result["2026-01-02"]).toBe(1);
      expect(result["2026-03-05"]).toBe(1);

      // Dates with no reviews should not be present (sparse map)
      expect(result["2026-01-03"]).toBeUndefined();
    });

    it("returns empty map when no reviews in the year", async () => {
      const result = await statsService.getHeatmap(userId, 2025);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it("excludes reviews from other years", async () => {
      const cardId = await createCard("Q1", "A1");

      const dec2025 = new Date("2025-12-31T12:00:00Z");
      const jan2026 = new Date("2026-01-01T12:00:00Z");
      const jan2027 = new Date("2027-01-01T12:00:00Z");

      await addReviewLog(cardId, dec2025);
      await addReviewLog(cardId, jan2026);
      await addReviewLog(cardId, jan2027);

      const result = await statsService.getHeatmap(userId, 2026);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result["2026-01-01"]).toBe(1);
    });
  });
});
