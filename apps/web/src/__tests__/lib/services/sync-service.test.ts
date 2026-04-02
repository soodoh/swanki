import { DeckService } from "@swanki/core/services/deck-service";
import { SyncService } from "@swanki/core/services/sync-service";
import type { SyncPushRequest } from "@swanki/core/services/sync-types";
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

const emptyPayload: SyncPushRequest = {
	decks: [],
	noteTypes: [],
	cardTemplates: [],
	notes: [],
	cards: [],
	reviewLogs: [],
	media: [],
	noteMedia: [],
	deletions: [],
};

describe("SyncService", () => {
	describe("pullDelta", () => {
		it("includes deletions from tombstone table", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const deckService = new DeckService(db, "/tmp", mockFs);

			const deck = await deckService.create("user1", { name: "Test" });
			const beforeDelete = Date.now();
			await deckService.delete(deck.id, "user1");

			const result = await syncService.pullDelta("user1", beforeDelete);
			expect(result.deletions.length).toBeGreaterThanOrEqual(1);
			expect(result.deletions).toStrictEqual(
				expect.arrayContaining([
					expect.objectContaining({ tableName: "decks", entityId: deck.id }),
				]),
			);
		});

		it("does not include deletions from before since timestamp", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const deckService = new DeckService(db, "/tmp", mockFs);

			const deck = await deckService.create("user1", { name: "Test" });
			await deckService.delete(deck.id, "user1");
			const afterDelete = Date.now() + 1000;

			const result = await syncService.pullDelta("user1", afterDelete);
			expect(result.deletions).toHaveLength(0);
		});
	});

	describe("push", () => {
		it("inserts new deck entities", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const now = Date.now();

			const result = await syncService.push("user1", {
				...emptyPayload,
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "Pushed Deck",
						createdAt: now,
						updatedAt: now,
					},
				],
			});

			expect(result.pushedAt).toBeGreaterThan(0);
			expect(result.conflicts).toHaveLength(0);
			const pullResult = await syncService.pullFull("user1");
			expect(
				pullResult.decks.some(
					(d: Record<string, unknown>) => d.id === "deck-1",
				),
			).toBe(true);
		});

		it("overrides userId on pushed entities for security", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const now = Date.now();

			await syncService.push("real-user", {
				...emptyPayload,
				decks: [
					{
						id: "deck-1",
						userId: "spoofed-user",
						name: "Deck",
						createdAt: now,
						updatedAt: now,
					},
				],
			});

			const pullResult = await syncService.pullFull("real-user");
			expect(pullResult.decks).toHaveLength(1);
			expect(pullResult.decks[0].userId).toBe("real-user");

			// Spoofed user should have nothing
			const spoofedResult = await syncService.pullFull("spoofed-user");
			expect(spoofedResult.decks).toHaveLength(0);
		});

		it("client wins with LWW when incoming updatedAt >= existing", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const earlier = Date.now() - 10000;
			const later = Date.now();

			// First push creates the deck
			await syncService.push("user1", {
				...emptyPayload,
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "Original",
						createdAt: earlier,
						updatedAt: earlier,
					},
				],
			});

			// Second push with newer timestamp should win
			const result = await syncService.push("user1", {
				...emptyPayload,
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "Updated",
						createdAt: earlier,
						updatedAt: later,
					},
				],
			});

			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0]).toStrictEqual({
				tableName: "decks",
				entityId: "deck-1",
				winner: "client",
			});

			const pullResult = await syncService.pullFull("user1");
			expect(pullResult.decks[0].name).toBe("Updated");
		});

		it("server wins with LWW when incoming updatedAt < existing", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const earlier = Date.now() - 10000;
			const later = Date.now();

			// First push creates the deck with later timestamp
			await syncService.push("user1", {
				...emptyPayload,
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "Server Version",
						createdAt: earlier,
						updatedAt: later,
					},
				],
			});

			// Second push with older timestamp should lose
			const result = await syncService.push("user1", {
				...emptyPayload,
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "Old Client Version",
						createdAt: earlier,
						updatedAt: earlier,
					},
				],
			});

			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0]).toStrictEqual({
				tableName: "decks",
				entityId: "deck-1",
				winner: "server",
			});

			const pullResult = await syncService.pullFull("user1");
			expect(pullResult.decks[0].name).toBe("Server Version");
		});

		it("inserts full note type + template + note + card chain", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const now = Date.now();

			await syncService.push("user1", {
				...emptyPayload,
				noteTypes: [
					{
						id: "nt-1",
						userId: "user1",
						name: "Basic",
						fields: [
							{ name: "Front", ordinal: 0 },
							{ name: "Back", ordinal: 1 },
						],
						css: "",
						createdAt: now,
						updatedAt: now,
					},
				],
				cardTemplates: [
					{
						id: "ct-1",
						noteTypeId: "nt-1",
						name: "Card 1",
						ordinal: 0,
						questionTemplate: "{{Front}}",
						answerTemplate: "{{Back}}",
						updatedAt: now,
					},
				],
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "Test Deck",
						createdAt: now,
						updatedAt: now,
					},
				],
				notes: [
					{
						id: "note-1",
						userId: "user1",
						noteTypeId: "nt-1",
						fields: { Front: "Hello", Back: "World" },
						tags: "",
						createdAt: now,
						updatedAt: now,
					},
				],
				cards: [
					{
						id: "card-1",
						noteId: "note-1",
						deckId: "deck-1",
						templateId: "ct-1",
						ordinal: 0,
						due: now,
						stability: 0,
						difficulty: 0,
						elapsedDays: 0,
						scheduledDays: 0,
						reps: 0,
						lapses: 0,
						state: 0,
						suspended: 0,
						createdAt: now,
						updatedAt: now,
					},
				],
			});

			const pullResult = await syncService.pullFull("user1");
			expect(pullResult.noteTypes).toHaveLength(1);
			expect(pullResult.cardTemplates).toHaveLength(1);
			expect(pullResult.decks).toHaveLength(1);
			expect(pullResult.notes).toHaveLength(1);
			expect(pullResult.cards).toHaveLength(1);
		});

		it("reviewLogs are append-only (skip if exists)", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const now = Date.now();

			// Set up prerequisite entities
			await syncService.push("user1", {
				...emptyPayload,
				noteTypes: [
					{
						id: "nt-1",
						userId: "user1",
						name: "Basic",
						fields: [
							{ name: "Front", ordinal: 0 },
							{ name: "Back", ordinal: 1 },
						],
						createdAt: now,
						updatedAt: now,
					},
				],
				cardTemplates: [
					{
						id: "ct-1",
						noteTypeId: "nt-1",
						name: "Card 1",
						ordinal: 0,
						questionTemplate: "{{Front}}",
						answerTemplate: "{{Back}}",
						updatedAt: now,
					},
				],
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "Test",
						createdAt: now,
						updatedAt: now,
					},
				],
				notes: [
					{
						id: "note-1",
						userId: "user1",
						noteTypeId: "nt-1",
						fields: { Front: "Q", Back: "A" },
						createdAt: now,
						updatedAt: now,
					},
				],
				cards: [
					{
						id: "card-1",
						noteId: "note-1",
						deckId: "deck-1",
						templateId: "ct-1",
						ordinal: 0,
						due: now,
						state: 0,
						suspended: 0,
						createdAt: now,
						updatedAt: now,
					},
				],
			});

			// Push same review log twice
			const reviewLog = {
				id: "rl-1",
				cardId: "card-1",
				rating: 3,
				state: 0,
				due: now,
				stability: 4.5,
				difficulty: 5,
				elapsedDays: 0,
				lastElapsedDays: 0,
				scheduledDays: 1,
				reviewedAt: now,
				timeTakenMs: 5000,
			};

			await syncService.push("user1", {
				...emptyPayload,
				reviewLogs: [reviewLog],
			});

			// Second push with same ID should not throw
			await syncService.push("user1", {
				...emptyPayload,
				reviewLogs: [reviewLog],
			});

			const pullResult = await syncService.pullFull("user1");
			expect(pullResult.reviewLogs).toHaveLength(1);
		});

		it("media returns mediaToUpload for new media records", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const now = Date.now();

			const result = await syncService.push("user1", {
				...emptyPayload,
				media: [
					{
						id: "hash-abc123",
						userId: "user1",
						filename: "image.png",
						mimeType: "image/png",
						size: 1024,
						createdAt: now,
					},
				],
			});

			expect(result.mediaToUpload).toStrictEqual(["hash-abc123"]);

			// Second push should not include it in mediaToUpload
			const result2 = await syncService.push("user1", {
				...emptyPayload,
				media: [
					{
						id: "hash-abc123",
						userId: "user1",
						filename: "image.png",
						mimeType: "image/png",
						size: 1024,
						createdAt: now,
					},
				],
			});

			expect(result2.mediaToUpload).toStrictEqual([]);
		});

		it("push deletions remove entities with LWW check", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const now = Date.now();

			// Create a deck
			await syncService.push("user1", {
				...emptyPayload,
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "To Delete",
						createdAt: now,
						updatedAt: now,
					},
				],
			});

			// Push a deletion with deletedAt >= updatedAt
			await syncService.push("user1", {
				...emptyPayload,
				deletions: [
					{
						tableName: "decks",
						entityId: "deck-1",
						deletedAt: now + 1000,
					},
				],
			});

			const pullResult = await syncService.pullFull("user1");
			expect(pullResult.decks).toHaveLength(0);
		});

		it("push deletions skip entities updated after deletedAt", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const earlier = Date.now() - 10000;
			const later = Date.now();

			// Create a deck with a later timestamp
			await syncService.push("user1", {
				...emptyPayload,
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "Updated After Delete",
						createdAt: earlier,
						updatedAt: later,
					},
				],
			});

			// Push a deletion with an older deletedAt — should not delete
			await syncService.push("user1", {
				...emptyPayload,
				deletions: [
					{
						tableName: "decks",
						entityId: "deck-1",
						deletedAt: earlier,
					},
				],
			});

			const pullResult = await syncService.pullFull("user1");
			expect(pullResult.decks).toHaveLength(1);
			expect(pullResult.decks[0].name).toBe("Updated After Delete");
		});

		it("push deletions still record tombstone even when entity is skipped", async () => {
			const db = createTestDb();
			const syncService = new SyncService(db);
			const earlier = Date.now() - 10000;
			const later = Date.now();

			// Create a deck with a later timestamp
			await syncService.push("user1", {
				...emptyPayload,
				decks: [
					{
						id: "deck-1",
						userId: "user1",
						name: "Kept",
						createdAt: earlier,
						updatedAt: later,
					},
				],
			});

			// Push a deletion that will be skipped (entity updated after)
			await syncService.push("user1", {
				...emptyPayload,
				deletions: [
					{
						tableName: "decks",
						entityId: "deck-1",
						deletedAt: earlier,
					},
				],
			});

			// Tombstone should still be recorded in the deletions table for propagation
			const deltaResult = await syncService.pullDelta("user1", earlier - 1000);
			expect(deltaResult.deletions).toStrictEqual(
				expect.arrayContaining([
					expect.objectContaining({
						tableName: "decks",
						entityId: "deck-1",
					}),
				]),
			);
		});
	});
});
