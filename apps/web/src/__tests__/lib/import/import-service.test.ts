import { describe, it, expect, beforeEach } from "vitest";
import { createTestDbWithRaw } from "../../test-utils";
import {
  ImportService,
  detectFormat,
} from "../../../lib/services/import-service";
import {
  decks,
  noteTypes,
  cardTemplates,
  notes,
  cards,
} from "../../../db/schema";
import { eq } from "drizzle-orm";

type TestDb = ReturnType<typeof createTestDbWithRaw>["db"];

describe("detectFormat", () => {
  it('detects .apkg as "apkg"', () => {
    expect(detectFormat("deck.apkg")).toBe("apkg");
  });

  it('detects .colpkg as "colpkg"', () => {
    expect(detectFormat("deck.colpkg")).toBe("colpkg");
  });

  it('detects .csv as "csv"', () => {
    expect(detectFormat("notes.csv")).toBe("csv");
  });

  it('detects .txt as "txt"', () => {
    expect(detectFormat("notes.txt")).toBe("txt");
  });

  it('detects .zip as "crowdanki"', () => {
    expect(detectFormat("deck.zip")).toBe("crowdanki");
  });

  it("returns undefined for unknown extensions", () => {
    expect(detectFormat("file.pdf")).toBeUndefined();
    expect(detectFormat("file.docx")).toBeUndefined();
  });

  it("is case-insensitive", () => {
    expect(detectFormat("DECK.APKG")).toBe("apkg");
    expect(detectFormat("Notes.CSV")).toBe("csv");
  });
});

describe("ImportService", () => {
  let db: TestDb;
  let importService: ImportService;
  const userId = "user-1";

  beforeEach(() => {
    const testDb = createTestDbWithRaw();
    db = testDb.db;
    importService = new ImportService(testDb.db, testDb.rawDb);
  });

  describe("importFromCsv", () => {
    it("creates notes and cards from parsed CSV data with 2 columns", async () => {
      const result = await importService.importFromCsv(userId, {
        headers: ["Front", "Back"],
        rows: [
          ["Hello", "World"],
          ["Foo", "Bar"],
        ],
        deckName: "CSV Import",
      });

      expect(result.deckId).toBeDefined();
      expect(result.noteCount).toBe(2);
      expect(result.cardCount).toBe(2);

      // Verify deck was created
      const allDecks = await db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks).toHaveLength(1);
      expect(allDecks[0].name).toBe("CSV Import");

      // Verify notes were created with correct fields
      const allNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(2);
      const fieldValues = allNotes.map((n) => n.fields);
      expect(fieldValues).toContainEqual({ Front: "Hello", Back: "World" });
      expect(fieldValues).toContainEqual({ Front: "Foo", Back: "Bar" });

      // Verify cards were created
      const allCards = await db.select().from(cards).all();
      expect(allCards).toHaveLength(2);
    });

    it("uses default deck name when not provided", async () => {
      await importService.importFromCsv(userId, {
        headers: ["Front", "Back"],
        rows: [["Q", "A"]],
      });

      const allDecks = await db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks[0].name).toBe("CSV Import");
    });

    it("generates field names when headers are missing", async () => {
      const result = await importService.importFromCsv(userId, {
        rows: [
          ["Hello", "World"],
          ["Foo", "Bar"],
        ],
      });

      expect(result.noteCount).toBe(2);

      // Should use "Field 1", "Field 2" as field names
      const allNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes[0].fields).toHaveProperty("Field 1");
      expect(allNotes[0].fields).toHaveProperty("Field 2");
    });

    it("creates a Basic note type with template", async () => {
      await importService.importFromCsv(userId, {
        headers: ["Question", "Answer"],
        rows: [["What?", "That"]],
        deckName: "Test",
      });

      const allNoteTypes = await db
        .select()
        .from(noteTypes)
        .where(eq(noteTypes.userId, userId))
        .all();
      expect(allNoteTypes).toHaveLength(1);

      const allTemplates = await db
        .select()
        .from(cardTemplates)
        .where(eq(cardTemplates.noteTypeId, allNoteTypes[0].id))
        .all();
      expect(allTemplates).toHaveLength(1);
      expect(allTemplates[0].questionTemplate).toContain("Question");
      expect(allTemplates[0].answerTemplate).toContain("Answer");
    });

    it("handles empty rows gracefully", async () => {
      const result = await importService.importFromCsv(userId, {
        headers: ["Front", "Back"],
        rows: [],
        deckName: "Empty",
      });

      expect(result.noteCount).toBe(0);
      expect(result.cardCount).toBe(0);
    });

    it("handles single-column CSV", async () => {
      const result = await importService.importFromCsv(userId, {
        headers: ["Term"],
        rows: [["Apple"], ["Banana"]],
        deckName: "Single Col",
      });

      expect(result.noteCount).toBe(2);

      const allNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes[0].fields).toStrictEqual({ Term: "Apple" });
    });
  });

  describe("importFromCrowdAnki", () => {
    it("creates deck, note types, notes, and cards from CrowdAnki data", async () => {
      const crowdAnkiJson = {
        name: "CrowdAnki Deck",
        children: [],
        note_models: [
          {
            crowdanki_uuid: "model-uuid-1",
            name: "Basic",
            flds: [
              { name: "Front", ord: 0 },
              { name: "Back", ord: 1 },
            ],
            tmpls: [
              {
                name: "Card 1",
                qfmt: "{{Front}}",
                afmt: "{{FrontSide}}<hr>{{Back}}",
                ord: 0,
              },
            ],
            css: ".card { font-family: arial; }",
          },
        ],
        notes: [
          {
            fields: ["hello", "world"],
            tags: ["tag1"],
            note_model_uuid: "model-uuid-1",
            guid: "abc123",
          },
          {
            fields: ["foo", "bar"],
            tags: [],
            note_model_uuid: "model-uuid-1",
            guid: "def456",
          },
        ],
      };

      const result = await importService.importFromCrowdAnki(
        userId,
        crowdAnkiJson,
      );

      expect(result.deckCount).toBe(1);
      expect(result.noteCount).toBe(2);
      expect(result.cardCount).toBe(2);

      // Verify deck
      const allDecks = await db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks).toHaveLength(1);
      expect(allDecks[0].name).toBe("CrowdAnki Deck");

      // Verify note type
      const allNoteTypes = await db
        .select()
        .from(noteTypes)
        .where(eq(noteTypes.userId, userId))
        .all();
      expect(allNoteTypes).toHaveLength(1);
      expect(allNoteTypes[0].name).toBe("Basic");

      // Verify notes
      const allNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(2);
    });

    it("handles nested children decks", async () => {
      const crowdAnkiJson = {
        name: "Parent",
        children: [
          {
            name: "Child",
            children: [],
            note_models: [],
            notes: [],
          },
        ],
        note_models: [
          {
            crowdanki_uuid: "model-1",
            name: "Basic",
            flds: [
              { name: "Front", ord: 0 },
              { name: "Back", ord: 1 },
            ],
            tmpls: [
              { name: "Card 1", qfmt: "{{Front}}", afmt: "{{Back}}", ord: 0 },
            ],
            css: "",
          },
        ],
        notes: [],
      };

      const result = await importService.importFromCrowdAnki(
        userId,
        crowdAnkiJson,
      );

      expect(result.deckCount).toBe(2);

      const allDecks = await db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks).toHaveLength(2);
      const names = allDecks.map((d) => d.name).toSorted();
      expect(names).toStrictEqual(["Child", "Parent"]);

      // Verify parent-child relationship
      const child = allDecks.find((d) => d.name === "Child");
      const parent = allDecks.find((d) => d.name === "Parent");
      expect(child?.parentId).toBe(parent?.id);
    });
  });
});
