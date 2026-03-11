/**
 * Local mutation functions using Drizzle ORM for the offline SQL.js database.
 * These apply mutations locally before they're synced to the server.
 */
import { eq, desc, inArray } from "drizzle-orm";
import type { LocalDrizzleDb } from "./local-drizzle";
import { decks, notes, cards, reviewLogs, noteMedia } from "../../db/schema";
import { scheduleFsrs } from "../fsrs";
import type { Grade } from "../fsrs";

// -- Deck mutations --

export function createDeck(
  db: LocalDrizzleDb,
  data: { id: string; userId: string; name: string; parentId?: number },
): void {
  const now = new Date();
  db.insert(decks)
    .values({
      userId: data.userId,
      name: data.name,
      parentId: data.parentId ?? null,
      description: "",
      settings: { newCardsPerDay: 20, maxReviewsPerDay: 200 },
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function updateDeck(
  db: LocalDrizzleDb,
  deckId: number,
  data: {
    name?: string;
    description?: string;
    parentId?: number | null;
    settings?: { newCardsPerDay: number; maxReviewsPerDay: number };
  },
): void {
  db.update(decks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(decks.id, deckId))
    .run();
}

export function deleteDeck(db: LocalDrizzleDb, deckId: number): void {
  const deck = db.select().from(decks).where(eq(decks.id, deckId)).get();
  if (!deck) {
    return;
  }

  // Get cards in this deck
  const deckCards = db
    .select({ id: cards.id, noteId: cards.noteId })
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .all();

  if (deckCards.length > 0) {
    const cardIds = deckCards.map((c) => c.id);
    const noteIds = [...new Set(deckCards.map((c) => c.noteId))];

    // Delete review logs
    db.delete(reviewLogs).where(inArray(reviewLogs.cardId, cardIds)).run();

    // Delete cards
    db.delete(cards).where(eq(cards.deckId, deckId)).run();

    // Delete orphaned notes
    for (const noteId of noteIds) {
      const remaining = db
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.noteId, noteId))
        .limit(1)
        .get();
      if (!remaining) {
        db.delete(noteMedia).where(eq(noteMedia.noteId, noteId)).run();
        db.delete(notes).where(eq(notes.id, noteId)).run();
      }
    }
  }

  // Reparent children
  db.update(decks)
    .set({ parentId: deck.parentId })
    .where(eq(decks.parentId, deckId))
    .run();

  // Delete deck
  db.delete(decks).where(eq(decks.id, deckId)).run();
}

// -- Review mutations --

export function submitReview(
  db: LocalDrizzleDb,
  cardId: number,
  rating: number,
  timeTakenMs: number,
): void {
  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!card) {
    return;
  }

  const now = new Date();

  const dbCard = {
    due: card.due,
    stability: card.stability ?? undefined,
    difficulty: card.difficulty ?? undefined,
    elapsedDays: card.elapsedDays ?? undefined,
    scheduledDays: card.scheduledDays ?? undefined,
    reps: card.reps ?? undefined,
    lapses: card.lapses ?? undefined,
    state: card.state ?? undefined,
    lastReview: card.lastReview ?? undefined,
  };

  const result = scheduleFsrs(dbCard, rating as Grade, now);

  // Update card
  db.update(cards)
    .set({
      due: result.card.due,
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      elapsedDays: result.card.elapsedDays,
      scheduledDays: result.card.scheduledDays,
      reps: result.card.reps,
      lapses: result.card.lapses,
      state: result.card.state,
      lastReview: result.card.lastReview,
      updatedAt: now,
    })
    .where(eq(cards.id, cardId))
    .run();

  // Insert review log
  db.insert(reviewLogs)
    .values({
      cardId,
      rating: result.log.rating,
      state: result.log.state,
      due: result.log.due,
      stability: result.log.stability,
      difficulty: result.log.difficulty,
      elapsedDays: result.log.elapsedDays,
      lastElapsedDays: result.log.lastElapsedDays,
      scheduledDays: result.log.scheduledDays,
      reviewedAt: now,
      timeTakenMs,
    })
    .run();
}

export function undoReview(db: LocalDrizzleDb, cardId: number): void {
  const lastLog = db
    .select()
    .from(reviewLogs)
    .where(eq(reviewLogs.cardId, cardId))
    .orderBy(desc(reviewLogs.reviewedAt))
    .limit(1)
    .get();
  if (!lastLog) {
    return;
  }

  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();

  const newReps = Math.max(0, (card?.reps ?? 0) - 1);
  const newLapses =
    lastLog.state === 2 || lastLog.state === 3
      ? Math.max(0, (card?.lapses ?? 0) - 1)
      : (card?.lapses ?? 0);

  db.update(cards)
    .set({
      due: lastLog.due,
      stability: lastLog.stability,
      difficulty: lastLog.difficulty,
      elapsedDays: lastLog.elapsedDays,
      scheduledDays: lastLog.scheduledDays,
      state: lastLog.state,
      reps: newReps,
      lapses: newLapses,
      lastReview: undefined,
      updatedAt: new Date(),
    })
    .where(eq(cards.id, cardId))
    .run();

  db.delete(reviewLogs).where(eq(reviewLogs.id, lastLog.id)).run();
}

// -- Note mutations --

export function updateNote(
  db: LocalDrizzleDb,
  noteId: number,
  data: { fields?: Record<string, string>; deckId?: number },
): void {
  const now = new Date();

  if (data.fields) {
    db.update(notes)
      .set({ fields: data.fields, updatedAt: now })
      .where(eq(notes.id, noteId))
      .run();
  }

  if (data.deckId) {
    db.update(cards)
      .set({ deckId: data.deckId, updatedAt: now })
      .where(eq(cards.noteId, noteId))
      .run();
  }
}

export function deleteNote(db: LocalDrizzleDb, noteId: number): void {
  const noteCards = db
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.noteId, noteId))
    .all();

  if (noteCards.length > 0) {
    const cardIds = noteCards.map((c) => c.id);
    db.delete(reviewLogs).where(inArray(reviewLogs.cardId, cardIds)).run();
  }

  db.delete(cards).where(eq(cards.noteId, noteId)).run();
  db.delete(noteMedia).where(eq(noteMedia.noteId, noteId)).run();
  db.delete(notes).where(eq(notes.id, noteId)).run();
}
