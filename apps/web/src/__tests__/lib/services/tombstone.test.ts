import { deletions } from "@swanki/core/db/schema";
import { DeckService } from "@swanki/core/services/deck-service";
import { NoteService } from "@swanki/core/services/note-service";
import { NoteTypeService } from "@swanki/core/services/note-type-service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../../test-utils";

const mockFs = {
	join: (...parts: string[]) => parts.join("/"),
	exists: async () => {
		const result = await Promise.resolve(false as boolean);
		return result;
	},
	unlink: async () => {},
	readFile: async (): Promise<Buffer> => {
		const result = await Promise.resolve(Buffer.from(""));
		return result;
	},
	writeFile: async () => {},
	mkdir: async () => {},
};

describe("Tombstone tracking", () => {
	it("creates tombstone when deck is deleted", async () => {
		const db = createTestDb();
		const deckService = new DeckService(db, "/tmp", mockFs);

		const deck = await deckService.create("user1", { name: "Test" });
		await deckService.delete(deck.id, "user1");

		const tombstones = db
			.select()
			.from(deletions)
			.where(eq(deletions.userId, "user1"))
			.all();

		expect(tombstones.length).toBeGreaterThanOrEqual(1);
		expect(tombstones).toStrictEqual(
			expect.arrayContaining([
				expect.objectContaining({
					tableName: "decks",
					entityId: deck.id,
				}),
			]),
		);
	});

	it("creates tombstone for cards and notes when deck with content is deleted", async () => {
		const db = createTestDb();
		const deckService = new DeckService(db, "/tmp", mockFs);
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

		expect(tombstones).toStrictEqual(
			expect.arrayContaining([
				expect.objectContaining({ tableName: "decks", entityId: deck.id }),
				expect.objectContaining({ tableName: "notes", entityId: note.id }),
				expect.objectContaining({ tableName: "cards" }),
			]),
		);
	});

	it("creates tombstone when note is deleted", async () => {
		const db = createTestDb();
		const deckService = new DeckService(db, "/tmp", mockFs);
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

		expect(tombstones).toStrictEqual(
			expect.arrayContaining([
				expect.objectContaining({ tableName: "notes", entityId: note.id }),
				expect.objectContaining({ tableName: "cards" }),
			]),
		);
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

		expect(tombstones).toStrictEqual(
			expect.arrayContaining([
				expect.objectContaining({
					tableName: "note_types",
					entityId: noteType.id,
				}),
				expect.objectContaining({
					tableName: "card_templates",
					entityId: template?.id,
				}),
			]),
		);
	});
});
