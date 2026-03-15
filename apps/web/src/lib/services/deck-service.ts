import { eq, and, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../../db/schema";
import {
  decks,
  cards,
  notes,
  noteTypes,
  cardTemplates,
  reviewLogs,
  noteMedia,
  media,
} from "../../db/schema";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-member-access) -- node:path and process are untyped in this project
const MEDIA_DIR: string = join(process.cwd(), "data", "media");

type Db = BetterSQLite3Database<typeof schema>;

type Deck = typeof decks.$inferSelect;

export type DeckTreeNode = Deck & {
  children: DeckTreeNode[];
};

export class DeckService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  create(userId: string, data: { name: string; parentId?: number }): Deck {
    const now = new Date();

    const deck = this.db
      .insert(decks)
      .values({
        userId,
        name: data.name,
        parentId: data.parentId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return deck;
  }

  listByUser(userId: string): Deck[] {
    return this.db.select().from(decks).where(eq(decks.userId, userId)).all();
  }

  getTree(userId: string): DeckTreeNode[] {
    const allDecks = this.listByUser(userId);
    return buildTree(allDecks);
  }

  getById(id: number, userId: string): Deck | undefined {
    return this.db
      .select()
      .from(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .get();
  }

  update(
    id: number,
    userId: string,
    data: {
      name?: string;
      description?: string;
      parentId?: number | undefined;
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

  delete(id: number, userId: string): void {
    const existing = this.getById(id, userId);
    if (!existing) {
      return;
    }

    // Collect cards in this deck
    const deckCards = this.db
      .select({ id: cards.id, noteId: cards.noteId })
      .from(cards)
      .where(eq(cards.deckId, id))
      .all();

    if (deckCards.length > 0) {
      const cardIds = deckCards.map((c) => c.id);
      const noteIds = [...new Set(deckCards.map((c) => c.noteId))];

      // Delete review logs for these cards
      this.db
        .delete(reviewLogs)
        .where(inArray(reviewLogs.cardId, cardIds))
        .run();

      // Delete the cards
      this.db.delete(cards).where(inArray(cards.id, cardIds)).run();

      // Find orphaned notes (notes with no remaining cards)
      const orphanedNoteIds = noteIds.filter((noteId) => {
        const remaining = this.db
          .select({ id: cards.id })
          .from(cards)
          .where(eq(cards.noteId, noteId))
          .get();
        return !remaining;
      });

      if (orphanedNoteIds.length > 0) {
        // Collect media IDs referenced by orphaned notes
        const orphanedRefs = this.db
          .select({ mediaId: noteMedia.mediaId })
          .from(noteMedia)
          .where(inArray(noteMedia.noteId, orphanedNoteIds))
          .all();
        const mediaIds = [...new Set(orphanedRefs.map((r) => r.mediaId))];

        // Delete noteMedia entries for orphaned notes
        this.db
          .delete(noteMedia)
          .where(inArray(noteMedia.noteId, orphanedNoteIds))
          .run();

        // Collect note type IDs from orphaned notes before deleting them
        const orphanedNoteTypeIds = [
          ...new Set(
            this.db
              .select({ noteTypeId: notes.noteTypeId })
              .from(notes)
              .where(inArray(notes.id, orphanedNoteIds))
              .all()
              .map((n) => n.noteTypeId),
          ),
        ];

        // Delete orphaned notes
        this.db.delete(notes).where(inArray(notes.id, orphanedNoteIds)).run();

        // Clean up note types that no longer have any notes
        for (const noteTypeId of orphanedNoteTypeIds) {
          const stillUsed = this.db
            .select({ id: notes.id })
            .from(notes)
            .where(eq(notes.noteTypeId, noteTypeId))
            .get();

          if (!stillUsed) {
            this.db
              .delete(cardTemplates)
              .where(eq(cardTemplates.noteTypeId, noteTypeId))
              .run();
            this.db.delete(noteTypes).where(eq(noteTypes.id, noteTypeId)).run();
          }
        }

        // Clean up media that are now unreferenced
        for (const mediaId of mediaIds) {
          const stillReferenced = this.db
            .select({ id: noteMedia.id })
            .from(noteMedia)
            .where(eq(noteMedia.mediaId, mediaId))
            .get();

          if (!stillReferenced) {
            const mediaRecord = this.db
              .select()
              .from(media)
              .where(eq(media.id, mediaId))
              .get();

            if (mediaRecord) {
              // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call) -- node:path is untyped in this project
              const filePath: string = join(MEDIA_DIR, mediaRecord.filename);
              try {
                // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
                if (existsSync(filePath)) {
                  // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
                  unlinkSync(filePath);
                }
              } catch {
                // File may already be gone
              }
              this.db.delete(media).where(eq(media.id, mediaId)).run();
            }
          }
        }
      }
    }

    // Re-parent children to the deleted deck's parent
    this.db
      .update(decks)
      .set({ parentId: existing.parentId })
      .where(and(eq(decks.parentId, id), eq(decks.userId, userId)))
      .run();

    // Delete the deck
    this.db
      .delete(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .run();
  }
}

function buildTree(flatDecks: Deck[]): DeckTreeNode[] {
  const nodeMap = new Map<number, DeckTreeNode>();

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

  return sortTree(roots);
}

function sortTree(nodes: DeckTreeNode[]): DeckTreeNode[] {
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodes) {
    sortTree(node.children);
  }
  return nodes;
}
