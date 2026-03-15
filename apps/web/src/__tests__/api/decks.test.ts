import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, testMediaDir } from "../test-utils";
import { DeckService } from "../../lib/services/deck-service";
import { MediaService } from "../../lib/services/media-service";
import {
  cards,
  notes,
  noteTypes,
  cardTemplates,
  reviewLogs,
  noteMedia,
  media,
} from "../../db/schema";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

type TestDb = ReturnType<typeof createTestDb>;

describe("DeckService", () => {
  let db: TestDb;
  let deckService: DeckService;
  let testDir: string;
  const userId = "user-1";

  beforeEach(() => {
    testDir = join(testMediaDir, crypto.randomUUID());
    db = createTestDb();
    deckService = new DeckService(db, testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("create", () => {
    it("creates a deck with correct fields", async () => {
      const deck = await deckService.create(userId, { name: "My Deck" });

      expect(deck).toBeDefined();
      expect(deck.id).toBeDefined();
      expect(deck.name).toBe("My Deck");
      expect(deck.userId).toBe(userId);
      expect(deck.parentId).toBeNull();
      expect(deck.createdAt).toBeInstanceOf(Date);
      expect(deck.updatedAt).toBeInstanceOf(Date);
    });

    it("creates a nested deck with parentId", async () => {
      const parent = await deckService.create(userId, { name: "Parent" });
      const child = await deckService.create(userId, {
        name: "Child",
        parentId: parent.id,
      });

      expect(child.parentId).toBe(parent.id);
      expect(child.name).toBe("Child");
    });
  });

  describe("listByUser", () => {
    it("returns all decks for a user", async () => {
      await deckService.create(userId, { name: "Deck A" });
      await deckService.create(userId, { name: "Deck B" });
      await deckService.create("other-user", { name: "Other Deck" });

      const decks = await deckService.listByUser(userId);

      expect(decks).toHaveLength(2);
      expect(decks.map((d) => d.name).toSorted()).toStrictEqual([
        "Deck A",
        "Deck B",
      ]);
    });
  });

  describe("getTree", () => {
    it("returns nested tree with children arrays", async () => {
      const parent = await deckService.create(userId, { name: "Parent" });
      const child1 = await deckService.create(userId, {
        name: "Child 1",
        parentId: parent.id,
      });
      const child2 = await deckService.create(userId, {
        name: "Child 2",
        parentId: parent.id,
      });
      const grandchild = await deckService.create(userId, {
        name: "Grandchild",
        parentId: child1.id,
      });

      const tree = await deckService.getTree(userId);

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe("Parent");
      expect(tree[0].children).toHaveLength(2);

      const childNames = tree[0].children.map((c) => c.name).toSorted();
      expect(childNames).toStrictEqual(["Child 1", "Child 2"]);

      const child1Node = tree[0].children.find((c) => c.id === child1.id);
      expect(child1Node).toBeDefined();
      expect(child1Node!.children).toHaveLength(1);
      expect(child1Node!.children[0].name).toBe("Grandchild");
      expect(child1Node!.children[0].id).toBe(grandchild.id);

      const child2Node = tree[0].children.find((c) => c.id === child2.id);
      expect(child2Node).toBeDefined();
      expect(child2Node!.children).toHaveLength(0);
    });

    it("returns multiple root decks", async () => {
      await deckService.create(userId, { name: "Root A" });
      await deckService.create(userId, { name: "Root B" });

      const tree = await deckService.getTree(userId);

      expect(tree).toHaveLength(2);
      const names = tree.map((d) => d.name).toSorted();
      expect(names).toStrictEqual(["Root A", "Root B"]);
    });

    it("sorts siblings alphabetically by name", async () => {
      const parent = await deckService.create(userId, { name: "Parent" });
      await deckService.create(userId, { name: "Zebra", parentId: parent.id });
      await deckService.create(userId, { name: "Apple", parentId: parent.id });
      await deckService.create(userId, { name: "Mango", parentId: parent.id });
      // Root-level decks too
      await deckService.create(userId, { name: "Zoo" });
      await deckService.create(userId, { name: "Alpha" });

      const tree = await deckService.getTree(userId);
      const rootNames = tree.map((d) => d.name);
      expect(rootNames).toStrictEqual(["Alpha", "Parent", "Zoo"]);

      const parentNode = tree.find((d) => d.name === "Parent")!;
      const childNames = parentNode.children.map((c) => c.name);
      expect(childNames).toStrictEqual(["Apple", "Mango", "Zebra"]);
    });
  });

  describe("getById", () => {
    it("returns a single deck by id", async () => {
      const created = await deckService.create(userId, { name: "Test Deck" });
      const found = await deckService.getById(created.id, userId);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe("Test Deck");
    });

    it("returns undefined for wrong user", async () => {
      const created = await deckService.create(userId, { name: "Test Deck" });
      const found = await deckService.getById(created.id, "wrong-user");

      expect(found).toBeUndefined();
    });

    it("returns undefined for non-existent id", async () => {
      const found = await deckService.getById(999999, userId);

      expect(found).toBeUndefined();
    });
  });

  describe("update", () => {
    it("updates the deck name and returns it", async () => {
      const created = await deckService.create(userId, {
        name: "Original Name",
      });
      const updated = await deckService.update(created.id, userId, {
        name: "Updated Name",
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe("Updated Name");
      expect(updated!.id).toBe(created.id);
    });

    it("returns undefined for wrong user", async () => {
      const created = await deckService.create(userId, { name: "Test" });
      const updated = await deckService.update(created.id, "wrong-user", {
        name: "Nope",
      });

      expect(updated).toBeUndefined();
    });

    it("sets parentId to null to make deck root-level", async () => {
      const parent = await deckService.create(userId, { name: "Parent" });
      const child = await deckService.create(userId, {
        name: "Child",
        parentId: parent.id,
      });

      expect(child.parentId).toBe(parent.id);

      const updated = await deckService.update(child.id, userId, {
        parentId: null,
      });
      expect(updated).toBeDefined();
      expect(updated!.parentId).toBeNull();

      // Verify tree structure
      const tree = await deckService.getTree(userId);
      expect(tree).toHaveLength(2);
      const names = tree.map((d) => d.name);
      expect(names).toContain("Child");
      expect(names).toContain("Parent");
    });
  });

  describe("delete", () => {
    it("deletes a deck", async () => {
      const created = await deckService.create(userId, { name: "To Delete" });
      await deckService.delete(created.id, userId);

      const found = await deckService.getById(created.id, userId);
      expect(found).toBeUndefined();
    });

    it("re-parents children to the deleted deck's parent", async () => {
      const grandparent = await deckService.create(userId, {
        name: "Grandparent",
      });
      const parent = await deckService.create(userId, {
        name: "Parent",
        parentId: grandparent.id,
      });
      const child = await deckService.create(userId, {
        name: "Child",
        parentId: parent.id,
      });

      await deckService.delete(parent.id, userId);

      const updatedChild = await deckService.getById(child.id, userId);
      expect(updatedChild).toBeDefined();
      expect(updatedChild!.parentId).toBe(grandparent.id);
    });

    it("re-parents children to null when deleting a root deck", async () => {
      const parent = await deckService.create(userId, { name: "Root Parent" });
      const child = await deckService.create(userId, {
        name: "Child",
        parentId: parent.id,
      });

      await deckService.delete(parent.id, userId);

      const updatedChild = await deckService.getById(child.id, userId);
      expect(updatedChild).toBeDefined();
      expect(updatedChild!.parentId).toBeNull();
    });

    it("cascades delete to cards and review logs", () => {
      const deck = deckService.create(userId, { name: "Cascade Test" });

      // Create a note type, template, note, and card
      const noteType = db
        .insert(noteTypes)
        .values({
          userId,
          name: "Basic",
          fields: [{ name: "Front", ordinal: 0 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
        .get();
      const template = db
        .insert(cardTemplates)
        .values({
          noteTypeId: noteType.id,
          name: "Card 1",
          ordinal: 0,
          questionTemplate: "{{Front}}",
          answerTemplate: "{{Front}}",
        })
        .returning()
        .get();
      const note = db
        .insert(notes)
        .values({
          userId,
          noteTypeId: noteType.id,
          fields: { Front: "hello" },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
        .get();
      const card = db
        .insert(cards)
        .values({
          noteId: note.id,
          deckId: deck.id,
          templateId: template.id,
          ordinal: 0,
          due: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
        .get();
      db.insert(reviewLogs)
        .values({
          cardId: card.id,
          rating: 3,
          state: 0,
          due: new Date(),
          stability: 1,
          difficulty: 5,
          elapsedDays: 0,
          lastElapsedDays: 0,
          scheduledDays: 1,
          reviewedAt: new Date(),
          timeTakenMs: 1000,
        })
        .run();

      deckService.delete(deck.id, userId);

      expect(db.select().from(cards).all()).toHaveLength(0);
      expect(db.select().from(reviewLogs).all()).toHaveLength(0);
      expect(db.select().from(notes).all()).toHaveLength(0);
    });

    it("deletes orphaned media files when deck is deleted", async () => {
      const deck = deckService.create(userId, { name: "Media Test" });
      const mediaService = new MediaService(db, testDir);

      // Import a media file
      const { mapping } = await mediaService.importBatch(userId, [
        {
          filename: "test.png",
          index: "0",
          data: new Uint8Array([1, 2, 3, 4]),
        },
      ]);
      const mediaUrl = mapping.get("test.png")!;
      const mediaFilename = mediaUrl.replace("/api/media/", "");

      // Create note referencing the media
      const noteType = db
        .insert(noteTypes)
        .values({
          userId,
          name: "Basic",
          fields: [{ name: "Front", ordinal: 0 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
        .get();
      const template = db
        .insert(cardTemplates)
        .values({
          noteTypeId: noteType.id,
          name: "Card 1",
          ordinal: 0,
          questionTemplate: "{{Front}}",
          answerTemplate: "{{Front}}",
        })
        .returning()
        .get();
      const note = db
        .insert(notes)
        .values({
          userId,
          noteTypeId: noteType.id,
          fields: { Front: `<img src="${mediaUrl}">` },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
        .get();
      db.insert(cards)
        .values({
          noteId: note.id,
          deckId: deck.id,
          templateId: template.id,
          ordinal: 0,
          due: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      // Link note to media
      const mediaRecord = db.select().from(media).all()[0];
      db.insert(noteMedia)
        .values({ noteId: note.id, mediaId: mediaRecord.id })
        .run();

      // Verify media file exists before delete
      const filePath = join(testDir, mediaFilename);
      expect(existsSync(filePath)).toBe(true);

      // Delete the deck
      deckService.delete(deck.id, userId);

      // Everything should be cleaned up
      expect(db.select().from(cards).all()).toHaveLength(0);
      expect(db.select().from(notes).all()).toHaveLength(0);
      expect(db.select().from(noteMedia).all()).toHaveLength(0);
      expect(db.select().from(media).all()).toHaveLength(0);
      expect(existsSync(filePath)).toBe(false);
    });
  });
});
