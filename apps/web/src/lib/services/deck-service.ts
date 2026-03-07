import { eq, and } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { generateId } from "../id";
import type * as schema from "../../db/schema";
import { decks } from "../../db/schema";

type Db = BunSQLiteDatabase<typeof import("../../db/schema")>;

type Deck = typeof decks.$inferSelect;

export type DeckTreeNode = Deck & {
  children: DeckTreeNode[];
};

export class DeckService {
  constructor(private db: Db) {}

  async create(
    userId: string,
    data: { name: string; parentId?: string },
  ): Promise<Deck> {
    const id = generateId();
    const now = new Date();

    await this.db.insert(decks).values({
      id,
      userId,
      name: data.name,
      parentId: data.parentId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const deck = await this.db
      .select()
      .from(decks)
      .where(eq(decks.id, id))
      .get();

    return deck!;
  }

  async listByUser(userId: string): Promise<Deck[]> {
    return this.db.select().from(decks).where(eq(decks.userId, userId)).all();
  }

  async getTree(userId: string): Promise<DeckTreeNode[]> {
    const allDecks = await this.listByUser(userId);
    return buildTree(allDecks);
  }

  async getById(id: string, userId: string): Promise<Deck | undefined> {
    return this.db
      .select()
      .from(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .get();
  }

  async update(
    id: string,
    userId: string,
    data: { name?: string },
  ): Promise<Deck | undefined> {
    const existing = await this.getById(id, userId);
    if (!existing) return undefined;

    await this.db
      .update(decks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(decks.id, id), eq(decks.userId, userId)));

    return this.getById(id, userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.getById(id, userId);
    if (!existing) return;

    // Re-parent children to the deleted deck's parent
    await this.db
      .update(decks)
      .set({ parentId: existing.parentId })
      .where(and(eq(decks.parentId, id), eq(decks.userId, userId)));

    await this.db
      .delete(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)));
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
