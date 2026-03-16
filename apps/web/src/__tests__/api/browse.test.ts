import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, testMediaDir } from "../test-utils";
import { BrowseService } from "../../lib/services/browse-service";
import { NoteService } from "../../lib/services/note-service";
import { DeckService } from "../../lib/services/deck-service";
import { noteTypes, cardTemplates, cards } from "../../db/schema";
import { eq } from "drizzle-orm";
import { nodeFs } from "@swanki/core/node-filesystem";

type TestDb = ReturnType<typeof createTestDb>;

describe("BrowseService", () => {
  let db: TestDb;
  let browseService: BrowseService;
  let noteService: NoteService;
  let deckService: DeckService;
  const userId = "user-1";

  // Shared fixtures
  let deckId: number;
  let noteTypeId: number;

  beforeEach(async () => {
    db = createTestDb();
    browseService = new BrowseService(db);
    noteService = new NoteService(db);
    deckService = new DeckService(db, testMediaDir, nodeFs);

    // Create a deck
    const deck = await deckService.create(userId, { name: "Japanese" });
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

  describe("search", () => {
    it("returns all notes when query is empty", async () => {
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

      expect(result.notes).toHaveLength(2);
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

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].fields.Front).toBe("Konnichiwa");
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

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].fields.Front).toBe("Taberu");
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

      // Set second note's card to review state
      const allCards = db.select().from(cards).all();
      db.update(cards)
        .set({ state: 2, due: pastDate })
        .where(eq(cards.id, allCards[1].id))
        .run();

      const result = await browseService.search(userId, "is:new");

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].fields.Front).toBe("New card");
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

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].fields.Front).toBe("Hello world");
    });

    it("paginates: page 1 and page 2 return different results", async () => {
      // Create 3 notes
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

      expect(page1.notes).toHaveLength(2);
      expect(page2.notes).toHaveLength(1);
      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);

      // Ensure no overlap
      const page1Ids = page1.notes.map((n) => n.noteId);
      const page2Ids = page2.notes.map((n) => n.noteId);
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });

    it("does not return notes for other users", async () => {
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "My card", Back: "A" },
      });

      const result = await browseService.search("other-user", "");

      expect(result.notes).toHaveLength(0);
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

      const allCards = db.select().from(cards).all();
      db.update(cards)
        .set({ due: pastDate })
        .where(eq(cards.id, allCards[0].id))
        .run();
      db.update(cards)
        .set({ due: futureDate })
        .where(eq(cards.id, allCards[1].id))
        .run();

      const result = await browseService.search(userId, "is:due");

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].fields.Front).toBe("Due card");
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

      const allCards = db.select().from(cards).all();
      db.update(cards)
        .set({ state: 2 })
        .where(eq(cards.id, allCards[0].id))
        .run();

      const result = await browseService.search(userId, "is:review");

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].fields.Front).toBe("Review card");
    });

    it("returns correct note shape with aggregated card data", async () => {
      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Hello", Back: "World" },
        tags: "greeting",
      });

      const result = await browseService.search(userId, "");

      expect(result.notes).toHaveLength(1);
      const note = result.notes[0];
      expect(note.noteId).toBeDefined();
      expect(note.noteTypeId).toBe(noteTypeId);
      expect(note.noteTypeName).toBe("Basic");
      expect(note.fields).toStrictEqual({ Front: "Hello", Back: "World" });
      expect(note.tags).toBe("greeting");
      expect(note.deckName).toBe("Japanese");
      expect(note.deckId).toBe(deckId);
      expect(note.cardCount).toBe(1);
      expect(note.states).toStrictEqual([0]);
      expect(note.createdAt).toBeDefined();
      expect(note.updatedAt).toBeDefined();
    });

    it("filters by note type name", async () => {
      // Create a second note type
      const noteType2 = db
        .insert(noteTypes)
        .values({
          userId,
          name: "Cloze",
          fields: [{ name: "Text", ordinal: 0 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
        .get();
      db.insert(cardTemplates)
        .values({
          noteTypeId: noteType2.id,
          name: "Cloze Card",
          ordinal: 0,
          questionTemplate: "{{cloze:Text}}",
          answerTemplate: "{{cloze:Text}}",
        })
        .run();

      await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Basic note", Back: "Answer" },
      });
      await noteService.create(userId, {
        noteTypeId: noteType2.id,
        deckId,
        fields: { Text: "Cloze note" },
      });

      const result = await browseService.search(userId, "notetype:Basic");

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].noteTypeName).toBe("Basic");
    });

    it("aggregates multiple cards per note (multi-template note type)", async () => {
      // Create a note type with 2 templates
      const now = new Date();
      const multiNoteType = db
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

      db.insert(cardTemplates)
        .values({
          noteTypeId: multiNoteType.id,
          name: "Card 1",
          ordinal: 0,
          questionTemplate: "{{Front}}",
          answerTemplate: "{{Back}}",
        })
        .run();
      db.insert(cardTemplates)
        .values({
          noteTypeId: multiNoteType.id,
          name: "Card 2 (reversed)",
          ordinal: 1,
          questionTemplate: "{{Back}}",
          answerTemplate: "{{Front}}",
        })
        .run();

      // Create a note using this 2-template note type
      await noteService.create(userId, {
        noteTypeId: multiNoteType.id,
        deckId,
        fields: { Front: "Apple", Back: "Ringo" },
      });

      const result = await browseService.search(userId, "");

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].cardCount).toBe(2);
      expect(result.notes[0].noteTypeName).toBe("Basic (and reversed)");
    });
  });

  describe("getNoteDetail", () => {
    it("returns note with note type, templates, and deck", async () => {
      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Hello", Back: "World" },
        tags: "greeting",
      });

      const detail = await browseService.getNoteDetail(userId, note.id);

      expect(detail).toBeDefined();
      expect(detail!.note.id).toBe(note.id);
      expect(detail!.note.fields).toStrictEqual({
        Front: "Hello",
        Back: "World",
      });
      expect(detail!.noteType.id).toBe(noteTypeId);
      expect(detail!.noteType.name).toBe("Basic");
      expect(detail!.templates).toHaveLength(1);
      expect(detail!.deckName).toBe("Japanese");
      expect(detail!.deckId).toBe(deckId);
    });

    it("returns undefined for wrong user", async () => {
      const note = await noteService.create(userId, {
        noteTypeId,
        deckId,
        fields: { Front: "Hello", Back: "World" },
      });

      const detail = await browseService.getNoteDetail("wrong-user", note.id);
      expect(detail).toBeUndefined();
    });

    it("returns undefined for non-existent note", async () => {
      const detail = await browseService.getNoteDetail(userId, 999999);
      expect(detail).toBeUndefined();
    });
  });
});
