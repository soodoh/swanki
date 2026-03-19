import { describe, it, expect } from "vitest";
import { createTestDb } from "../../test-utils";
import { DeckService } from "@swanki/core/services/deck-service";
import { NoteService } from "@swanki/core/services/note-service";
import { NoteTypeService } from "@swanki/core/services/note-type-service";
import { deletions } from "@swanki/core/db/schema";
import { eq } from "drizzle-orm";

describe("Tombstone tracking", () => {
  it("creates tombstone when deck is deleted", async () => {
    const db = createTestDb();
    const deckService = new DeckService(db, "/tmp", {
      join: (...parts: string[]) => parts.join("/"),
      exists: async () => false,
      unlink: async () => {},
      readFile: async () => Buffer.from(""),
      writeFile: async () => {},
      mkdir: async () => {},
    });

    const deck = await deckService.create("user1", { name: "Test" });
    await deckService.delete(deck.id, "user1");

    const tombstones = db
      .select()
      .from(deletions)
      .where(eq(deletions.userId, "user1"))
      .all();

    expect(tombstones.length).toBeGreaterThanOrEqual(1);
    expect(
      tombstones.some((t) => t.tableName === "decks" && t.entityId === deck.id),
    ).toBe(true);
  });

  it("creates tombstone for cards and notes when deck with content is deleted", async () => {
    const db = createTestDb();
    const deckService = new DeckService(db, "/tmp", {
      join: (...parts: string[]) => parts.join("/"),
      exists: async () => false,
      unlink: async () => {},
      readFile: async () => Buffer.from(""),
      writeFile: async () => {},
      mkdir: async () => {},
    });
    const noteTypeService = new NoteTypeService(db);
    const noteService = new NoteService(db);

    const deck = await deckService.create("user1", { name: "Test Deck" });
    const noteType = await noteTypeService.create("user1", {
      name: "Basic",
      fields: [
        { name: "Front", ordinal: 0 },
        { name: "Back", ordinal: 1 },
      ],
    });
    await noteTypeService.addTemplate(noteType.id, "user1", {
      name: "Card 1",
      questionTemplate: "{{Front}}",
      answerTemplate: "{{Back}}",
    });

    const note = await noteService.create("user1", {
      noteTypeId: noteType.id,
      deckId: deck.id,
      fields: { Front: "Q", Back: "A" },
    });

    await deckService.delete(deck.id, "user1");

    const tombstones = db
      .select()
      .from(deletions)
      .where(eq(deletions.userId, "user1"))
      .all();

    expect(
      tombstones.some((t) => t.tableName === "decks" && t.entityId === deck.id),
    ).toBe(true);
    expect(
      tombstones.some((t) => t.tableName === "notes" && t.entityId === note.id),
    ).toBe(true);
    expect(tombstones.some((t) => t.tableName === "cards")).toBe(true);
  });

  it("creates tombstone when note is deleted", async () => {
    const db = createTestDb();
    const deckService = new DeckService(db, "/tmp", {
      join: (...parts: string[]) => parts.join("/"),
      exists: async () => false,
      unlink: async () => {},
      readFile: async () => Buffer.from(""),
      writeFile: async () => {},
      mkdir: async () => {},
    });
    const noteTypeService = new NoteTypeService(db);
    const noteService = new NoteService(db);

    const deck = await deckService.create("user1", { name: "Test Deck" });
    const noteType = await noteTypeService.create("user1", {
      name: "Basic",
      fields: [
        { name: "Front", ordinal: 0 },
        { name: "Back", ordinal: 1 },
      ],
    });
    await noteTypeService.addTemplate(noteType.id, "user1", {
      name: "Card 1",
      questionTemplate: "{{Front}}",
      answerTemplate: "{{Back}}",
    });

    const note = await noteService.create("user1", {
      noteTypeId: noteType.id,
      deckId: deck.id,
      fields: { Front: "Q", Back: "A" },
    });

    await noteService.delete(note.id, "user1");

    const tombstones = db
      .select()
      .from(deletions)
      .where(eq(deletions.userId, "user1"))
      .all();

    expect(
      tombstones.some((t) => t.tableName === "notes" && t.entityId === note.id),
    ).toBe(true);
    expect(tombstones.some((t) => t.tableName === "cards")).toBe(true);
  });

  it("creates tombstone when note type is deleted", async () => {
    const db = createTestDb();
    const noteTypeService = new NoteTypeService(db);

    const noteType = await noteTypeService.create("user1", {
      name: "Basic",
      fields: [
        { name: "Front", ordinal: 0 },
        { name: "Back", ordinal: 1 },
      ],
    });
    const template = await noteTypeService.addTemplate(noteType.id, "user1", {
      name: "Card 1",
      questionTemplate: "{{Front}}",
      answerTemplate: "{{Back}}",
    });

    await noteTypeService.delete(noteType.id, "user1");

    const tombstones = db
      .select()
      .from(deletions)
      .where(eq(deletions.userId, "user1"))
      .all();

    expect(
      tombstones.some(
        (t) => t.tableName === "note_types" && t.entityId === noteType.id,
      ),
    ).toBe(true);
    expect(
      tombstones.some(
        (t) => t.tableName === "card_templates" && t.entityId === template!.id,
      ),
    ).toBe(true);
  });
});
