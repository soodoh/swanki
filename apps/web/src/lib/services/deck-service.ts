import { eq, and } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { generateId } from "../id";
import type * as schema from "../../db/schema";
import { decks } from "../../db/schema";

type Db = BunSQLiteDatabase<typeof schema>;

type Deck = typeof decks.$inferSelect;

export type DeckTreeNode = Deck & {
  children: DeckTreeNode[];
};

export class DeckService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  create(userId: string, data: { name: string; parentId?: string }): Deck {
    const id = generateId();
    const now = new Date();

    this.db.insert(decks).values({
      id,
      userId,
      name: data.name,
      parentId: data.parentId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const deck = this.db.select().from(decks).where(eq(decks.id, id)).get();

    return deck!;
  }

  listByUser(userId: string): Deck[] {
    return this.db.select().from(decks).where(eq(decks.userId, userId)).all();
  }

  getTree(userId: string): DeckTreeNode[] {
    const allDecks = this.listByUser(userId);
    return buildTree(allDecks);
  }

  getById(id: string, userId: string): Deck | undefined {
    return this.db
      .select()
      .from(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .get();
  }

  update(
    id: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
      parentId?: string;
      settings?: { newCardsPerDay: number; maxReviewsPerDay: number };
    },
  ): Deck | undefined {
    const existing = this.getById(id, userId);
    if (!existing) {
      return undefined;
    }

    this.db
      .update(decks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .run();

    return this.getById(id, userId);
  }

  delete(id: string, userId: string): void {
    const existing = this.getById(id, userId);
    if (!existing) {
      return;
    }

    // Re-parent children to the deleted deck's parent
    this.db
      .update(decks)
      .set({ parentId: existing.parentId })
      .where(and(eq(decks.parentId, id), eq(decks.userId, userId)))
      .run();

    this.db
      .delete(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .run();
  }
}

function buildTree(flatDecks: Deck[]): DeckTreeNode[] {
  const nodeMap = new Map<string, DeckTreeNode>();

  // Create nodes with empty children arrays
  for (const deck of flatDecks) {
    nodeMap.set(deck.id, { ...deck, children: [] });
  }

  const roots: DeckTreeNode[] = [];

  // Build parent-child relationships
  for (const deck of flatDecks) {
    const node = nodeMap.get(deck.id)!;
    if (deck.parentId && nodeMap.has(deck.parentId)) {
      nodeMap.get(deck.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
