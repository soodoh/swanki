import { eq, and, lte, gt, inArray, sql, gte } from "drizzle-orm";
import type { AppDb } from "../db/index";
import { cards, notes, decks, reviewLogs } from "../db/schema";

type Db = AppDb;

type Card = typeof cards.$inferSelect;

export type CardWithNote = Card & {
  noteFields: Record<string, string>;
};

export type CardCounts = {
  new: number;
  learning: number;
  review: number;
};

export type TodayReviewData = {
  newStudied: number;
  reviewStudied: number;
  reviewedNoteIds: Set<number>;
  reviewedCardIds: Set<number>;
};

export class CardService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  getTodayReviewData(userId: string, deckIds: number[]): TodayReviewData {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const rows = this.db
      .select({
        cardId: reviewLogs.cardId,
        preReviewState: reviewLogs.state,
        noteId: cards.noteId,
      })
      .from(reviewLogs)
      .innerJoin(cards, eq(reviewLogs.cardId, cards.id))
      .innerJoin(notes, eq(cards.noteId, notes.id))
      .where(
        and(
          eq(notes.userId, userId),
          inArray(cards.deckId, deckIds),
          gte(reviewLogs.reviewedAt, todayStart),
        ),
      )
      .all();

    const newCardIds = new Set<number>();
    const reviewCardIds = new Set<number>();
    const reviewedNoteIds = new Set<number>();
    const reviewedCardIds = new Set<number>();

    for (const row of rows) {
      reviewedCardIds.add(row.cardId);
      reviewedNoteIds.add(row.noteId);

      // Count distinct cards by their pre-review state
      if (row.preReviewState === 0) {
        newCardIds.add(row.cardId);
      } else if (row.preReviewState === 2) {
        reviewCardIds.add(row.cardId);
      }
    }

    return {
      newStudied: newCardIds.size,
      reviewStudied: reviewCardIds.size,
      reviewedNoteIds,
      reviewedCardIds,
    };
  }

  getDueCards(
    userId: string,
    deckId: number,
    options?: { includeChildren?: boolean },
  ): CardWithNote[] {
    const now = new Date();

    // Collect deck IDs to query
    const deckIds = [deckId];
    if (options?.includeChildren) {
      const childDecks = this.getDescendantDeckIds(deckId, userId);
      deckIds.push(...childDecks);
    }

    // Get deck settings for limits
    const deck = this.db
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

    // Get today's review data for daily limits and sibling burying
    const todayData = this.getTodayReviewData(userId, deckIds);

    const remainingNewLimit = Math.max(
      0,
      settings.newCardsPerDay - todayData.newStudied,
    );
    const remainingReviewLimit = Math.max(
      0,
      settings.maxReviewsPerDay - todayData.reviewStudied,
    );

    // Query all due cards: due <= now
    // Join with notes to get note data and filter by userId
    const dueRows = this.db
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

    // Sibling burying: filter out cards whose note was already reviewed today,
    // unless the card itself was reviewed (e.g. learning card coming back)
    const filteredRows = dueRows.filter((row) => {
      if (todayData.reviewedNoteIds.has(row.card.noteId)) {
        // Keep the card if it was itself reviewed today (learning steps)
        return todayData.reviewedCardIds.has(row.card.id);
      }
      return true;
    });

    // Separate by category for ordering and limits
    const reviewCards: CardWithNote[] = [];
    const learningCards: CardWithNote[] = [];
    const newCards: CardWithNote[] = [];

    for (const row of filteredRows) {
      const cardWithNote: CardWithNote = {
        ...row.card,
        noteFields: row.noteFields,
      };

      const state = row.card.state ?? 0;
      if (state === 2) {
        // review
        reviewCards.push(cardWithNote);
      } else if (state === 1 || state === 3) {
        // learning or relearning
        learningCards.push(cardWithNote);
      } else {
        // new (state === 0)
        newCards.push(cardWithNote);
      }
    }

    // Sort learning by due ascending (most overdue first)
    learningCards.sort(
      (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime(),
    );

    // Shuffle review cards (Fisher-Yates)
    for (let i = reviewCards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [reviewCards[i], reviewCards[j]] = [reviewCards[j], reviewCards[i]];
    }

    // Sort new cards by ordinal ascending
    newCards.sort((a, b) => a.ordinal - b.ordinal);

    // Apply daily limits (learning cards bypass limits)
    const limitedReviews = reviewCards.slice(0, remainingReviewLimit);
    const limitedNew = newCards.slice(0, remainingNewLimit);

    // Order: learning first, then reviews (shuffled), then new
    return [...learningCards, ...limitedReviews, ...limitedNew];
  }

  getById(id: number, userId: string): CardWithNote | undefined {
    const row = this.db
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

  moveToDeck(cardIds: number[], deckId: number, userId: string): void {
    if (cardIds.length === 0) {
      return;
    }

    // Verify cards belong to the user by joining with notes
    const userCards = this.db
      .select({ cardId: cards.id })
      .from(cards)
      .innerJoin(notes, eq(cards.noteId, notes.id))
      .where(and(inArray(cards.id, cardIds), eq(notes.userId, userId)))
      .all();

    const validCardIds = userCards.map((c) => c.cardId);

    if (validCardIds.length > 0) {
      this.db
        .update(cards)
        .set({ deckId, updatedAt: new Date() })
        .where(inArray(cards.id, validCardIds))
        .run();
    }
  }

  getDueCounts(
    userId: string,
    deckId: number,
    options?: { includeChildren?: boolean },
  ): CardCounts {
    const dueCards = this.getDueCards(userId, deckId, options);
    const counts: CardCounts = { new: 0, learning: 0, review: 0 };
    for (const card of dueCards) {
      const state = card.state ?? 0;
      if (state === 0) {
        counts.new += 1;
      } else if (state === 1 || state === 3) {
        counts.learning += 1;
      } else if (state === 2) {
        counts.review += 1;
      }
    }
    return counts;
  }

  getCounts(userId: string, deckId: number): CardCounts {
    const rows = this.db
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

  getPendingLearningCount(userId: string, deckIds: number[]): number {
    if (deckIds.length === 0) {
      return 0;
    }
    const now = new Date();
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(cards)
      .innerJoin(notes, eq(cards.noteId, notes.id))
      .where(
        and(
          eq(notes.userId, userId),
          inArray(cards.deckId, deckIds),
          inArray(cards.state, [1, 3]),
          gt(cards.due, now),
        ),
      )
      .get();
    return Number(row?.count ?? 0);
  }

  getDescendantDeckIds(parentId: number, userId: string): number[] {
    const children = this.db
      .select({ id: decks.id })
      .from(decks)
      .where(and(eq(decks.parentId, parentId), eq(decks.userId, userId)))
      .all();

    const result: number[] = [];
    for (const child of children) {
      result.push(child.id);
      const grandchildren = this.getDescendantDeckIds(child.id, userId);
      result.push(...grandchildren);
    }

    return result;
  }
}
