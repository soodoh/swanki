import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../test-utils";
import { DeckService } from "../../lib/services/deck-service";

type TestDb = ReturnType<typeof createTestDb>;

describe("DeckService", () => {
  let db: TestDb;
  let deckService: DeckService;
  const userId = "user-1";

  beforeEach(() => {
    db = createTestDb();
    deckService = new DeckService(db);
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
      expect(decks.map((d) => d.name).sort()).toEqual(["Deck A", "Deck B"]);
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

      const childNames = tree[0].children.map((c) => c.name).sort();
      expect(childNames).toEqual(["Child 1", "Child 2"]);

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
      const names = tree.map((d) => d.name).sort();
      expect(names).toEqual(["Root A", "Root B"]);
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
      const found = await deckService.getById("non-existent", userId);

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
  });
});
