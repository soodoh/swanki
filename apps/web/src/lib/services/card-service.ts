import { eq, and, lte, inArray, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { cards, notes, decks } from "../../db/schema";

type Db = BunSQLiteDatabase<typeof import("../../db/schema")>;

type Card = typeof cards.$inferSelect;

export type CardWithNote = Card & {
  noteFields: Record<string, string>;
};

export type CardCounts = {
  new: number;
  learning: number;
  review: number;
};

export class CardService {
  constructor(private db: Db) {}

  async getDueCards(
    userId: string,
    deckId: string,
    options?: { includeChildren?: boolean },
  ): Promise<CardWithNote[]> {
    const now = new Date();

    // Collect deck IDs to query
    const deckIds = [deckId];
    if (options?.includeChildren) {
      const childDecks = await this.getDescendantDeckIds(deckId, userId);
      deckIds.push(...childDecks);
    }

    // Get deck settings for limits
    const deck = await this.db
      .select()
      .from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.userId, userId)))
      .get();

    if (!deck) {
      return [];
    }

    const settings = deck.settings ?? {
      newCardsPerDay: 20,
      maxReviewsPerDay: 200,
    };

    // Query all due cards: due <= now OR state in (learning=1, relearning=3)
    // Join with notes to get note data and filter by userId
    const dueRows = await this.db
      .select({
        card: cards,
        noteFields: notes.fields,
      })
      .from(cards)
      .innerJoin(notes, eq(cards.noteId, notes.id))
      .where(
        and(
          eq(notes.userId, userId),
          inArray(cards.deckId, deckIds),
          lte(cards.due, now),
        ),
      )
      .all();

    // Separate by category for ordering and limits
    const reviewCards: CardWithNote[] = [];
    const learningCards: CardWithNote[] = [];
    const newCards: CardWithNote[] = [];

    for (const row of dueRows) {
      const cardWithNote: CardWithNote = {
        ...row.card,
        noteFields: row.noteFields,
      };

      const state = row.card.state ?? 0;
      if (state === 2 || state === 3) {
        // review or relearning
        reviewCards.push(cardWithNote);
      } else if (state === 1) {
        // learning
        learningCards.push(cardWithNote);
      } else {
        // new (state === 0)
        newCards.push(cardWithNote);
      }
    }

    // Apply limits
    const limitedReviews = reviewCards.slice(0, settings.maxReviewsPerDay);
    const limitedNew = newCards.slice(0, settings.newCardsPerDay);

    // Order: overdue reviews first, then learning, then new
    return [...limitedReviews, ...learningCards, ...limitedNew];
  }

  async getById(id: string, userId: string): Promise<CardWithNote | undefined> {
    const row = await this.db
      .select({
        card: cards,
        noteFields: notes.fields,
      })
      .from(cards)
      .innerJoin(notes, eq(cards.noteId, notes.id))
      .where(and(eq(cards.id, id), eq(notes.userId, userId)))
      .get();

    if (!row) {
      return undefined;
    }

    return {
      ...row.card,
      noteFields: row.noteFields,
    };
  }

  async moveToDeck(
    cardIds: string[],
    deckId: string,
    userId: string,
  ): Promise<void> {
    if (cardIds.length === 0) {
      return;
    }

    // Verify cards belong to the user by joining with notes
    const userCards = await this.db
      .select({ cardId: cards.id })
      .from(cards)
      .innerJoin(notes, eq(cards.noteId, notes.id))
      .where(and(inArray(cards.id, cardIds), eq(notes.userId, userId)))
      .all();

    const validCardIds = userCards.map((c) => c.cardId);

    if (validCardIds.length > 0) {
      await this.db
        .update(cards)
        .set({ deckId, updatedAt: new Date() })
        .where(inArray(cards.id, validCardIds));
    }
  }

  async getCounts(userId: string, deckId: string): Promise<CardCounts> {
    const rows = await this.db
      .select({
        state: cards.state,
        count: sql<number>`count(*)`,
      })
      .from(cards)
      .innerJoin(notes, eq(cards.noteId, notes.id))
      .where(and(eq(notes.userId, userId), eq(cards.deckId, deckId)))
      .groupBy(cards.state)
      .all();

    const counts: CardCounts = { new: 0, learning: 0, review: 0 };

    for (const row of rows) {
      const state = row.state ?? 0;
      if (state === 0) {
        counts.new = Number(row.count);
      } else if (state === 1) {
        counts.learning = Number(row.count);
      } else if (state === 2 || state === 3) {
        counts.review += Number(row.count);
      }
    }

    return counts;
  }

  private async getDescendantDeckIds(
    parentId: string,
    userId: string,
  ): Promise<string[]> {
    const children = await this.db
      .select({ id: decks.id })
      .from(decks)
      .where(and(eq(decks.parentId, parentId), eq(decks.userId, userId)))
      .all();

    const result: string[] = [];
    for (const child of children) {
      result.push(child.id);
      const grandchildren = await this.getDescendantDeckIds(child.id, userId);
      result.push(...grandchildren);
    }

    return result;
  }
}
