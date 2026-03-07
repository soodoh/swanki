import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../test-utils";
import { BrowseService } from "../../lib/services/browse-service";
import { NoteService } from "../../lib/services/note-service";
import { DeckService } from "../../lib/services/deck-service";
import { generateId } from "../../lib/id";
import { noteTypes, cardTemplates, cards, reviewLogs } from "../../db/schema";
import { eq } from "drizzle-orm";

type TestDb = ReturnType<typeof createTestDb>;

describe("BrowseService", () => {
  let db: TestDb;
  let browseService: BrowseService;
  let noteService: NoteService;
  let deckService: DeckService;
  const userId = "user-1";

  // Shared fixtures
  let deckId: string;
  let noteTypeId: string;
  let templateId: string;

  beforeEach(async () => {
    db = createTestDb();
    browseService = new BrowseService(db);
    noteService = new NoteService(db);
    deckService = new DeckService(db);

    // Create a deck
    const deck = await deckService.create(userId, { name: "Japanese" });
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

  describe("search", () => {
    it("returns all cards when query is empty", async () => {
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Hello", Back: "World" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Foo", Back: "Bar" },
      });

      const result = await browseService.search(userId, "");

      expect(result.cards).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by deck name", async () => {
      const deck2 = await deckService.create(userId, { name: "French" });

      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Konnichiwa", Back: "Hello" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId: deck2.id,
        fields: { Front: "Bonjour", Back: "Hello" },
      });

      const result = await browseService.search(userId, "deck:Japanese");

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].noteFields.Front).toBe("Konnichiwa");
    });

    it("filters by tag", async () => {
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Taberu", Back: "To eat" },
        tags: "verb japanese",
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Neko", Back: "Cat" },
        tags: "noun japanese",
      });

      const result = await browseService.search(userId, "tag:verb");

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].noteFields.Front).toBe("Taberu");
    });

    it("filters by is:new state", async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 86_400_000);

      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "New card", Back: "A" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Review card", Back: "B" },
      });

      // Set second card to review state
      const allCards = await db.select().from(cards).all();
      await db
        .update(cards)
        .set({ state: 2, due: pastDate })
        .where(eq(cards.id, allCards[1].id));

      const result = await browseService.search(userId, "is:new");

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].noteFields.Front).toBe("New card");
    });

    it("text search in note fields", async () => {
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Hello world", Back: "Greeting" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Goodbye", Back: "Farewell" },
      });

      const result = await browseService.search(userId, "hello");

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].noteFields.Front).toBe("Hello world");
    });

    it("paginates: page 1 and page 2 return different results", async () => {
      // Create 3 notes/cards
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
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Card 3", Back: "C" },
      });

      const page1 = await browseService.search(userId, "", {
        page: 1,
        limit: 2,
      });
      const page2 = await browseService.search(userId, "", {
        page: 2,
        limit: 2,
      });

      expect(page1.cards).toHaveLength(2);
      expect(page2.cards).toHaveLength(1);
      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);

      // Ensure no overlap
      const page1Ids = page1.cards.map((c) => c.id);
      const page2Ids = page2.cards.map((c) => c.id);
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });

    it("does not return cards for other users", async () => {
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "My card", Back: "A" },
      });

      const result = await browseService.search("other-user", "");

      expect(result.cards).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("handles is:due filter", async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 86_400_000);
      const futureDate = new Date(now.getTime() + 86_400_000);

      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Due card", Back: "A" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Not due", Back: "B" },
      });

      const allCards = await db.select().from(cards).all();
      await db
        .update(cards)
        .set({ due: pastDate })
        .where(eq(cards.id, allCards[0].id));
      await db
        .update(cards)
        .set({ due: futureDate })
        .where(eq(cards.id, allCards[1].id));

      const result = await browseService.search(userId, "is:due");

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].noteFields.Front).toBe("Due card");
    });

    it("handles is:review filter", async () => {
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Review card", Back: "A" },
      });
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "New card", Back: "B" },
      });

      const allCards = await db.select().from(cards).all();
      await db
        .update(cards)
        .set({ state: 2 })
        .where(eq(cards.id, allCards[0].id));

      const result = await browseService.search(userId, "is:review");

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].noteFields.Front).toBe("Review card");
    });
  });

  describe("getCardDetail", () => {
    it("returns full card info with note, note type, templates, and recent reviews", async () => {
      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Hello", Back: "World" },
        tags: "greeting",
      });

      const allCards = await db
        .select()
        .from(cards)
        .where(eq(cards.noteId, note.id))
        .all();
      const cardId = allCards[0].id;

      // Add a review log
      const reviewId = generateId();
      const now = new Date();
      await db.insert(reviewLogs).values({
        id: reviewId,
        cardId,
        rating: 3,
        state: 0,
        due: now,
        stability: 1,
        difficulty: 5,
        elapsedDays: 0,
        lastElapsedDays: 0,
        scheduledDays: 1,
        reviewedAt: now,
        timeTakenMs: 5000,
      });

      const detail = await browseService.getCardDetail(userId, cardId);

      expect(detail).toBeDefined();
      expect(detail!.card.id).toBe(cardId);
      expect(detail!.note.id).toBe(note.id);
      expect(detail!.note.fields).toStrictEqual({
        Front: "Hello",
        Back: "World",
      });
      expect(detail!.noteType.id).toBe(noteTypeId);
      expect(detail!.noteType.name).toBe("Basic");
      expect(detail!.templates).toHaveLength(1);
      expect(detail!.templates[0].id).toBe(templateId);
      expect(detail!.recentReviews).toHaveLength(1);
      expect(detail!.recentReviews[0].rating).toBe(3);
      expect(detail!.deckName).toBe("Japanese");
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

      const detail = await browseService.getCardDetail("wrong-user", cardId);

      expect(detail).toBeUndefined();
    });

    it("returns undefined for non-existent card", async () => {
      const detail = await browseService.getCardDetail(userId, "no-such-card");

      expect(detail).toBeUndefined();
    });
  });
});
