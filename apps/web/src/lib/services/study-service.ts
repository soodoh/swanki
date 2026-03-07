import { eq, desc } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "../../db/schema";
import { cards, reviewLogs } from "../../db/schema";
import { generateId } from "../id";
import { CardService } from "./card-service";
import { scheduleFsrs, previewAll } from "../fsrs";
import type { CardCounts, CardWithNote } from "./card-service";
import type { Grade, FsrsResult, IntervalPreview } from "../fsrs";

type Db = BunSQLiteDatabase<typeof schema>;

export type StudySession = {
  cards: CardWithNote[];
  counts: CardCounts;
};

export type ReviewResult = {
  card: CardWithNote;
  fsrs: FsrsResult;
};

export class StudyService {
  private cardService: CardService;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.cardService = new CardService(db);
  }

  async getStudySession(userId: string, deckId: string): Promise<StudySession> {
    const dueCards = await this.cardService.getDueCards(userId, deckId);
    const counts = await this.cardService.getCounts(userId, deckId);

    return {
      cards: dueCards,
      counts,
    };
  }

  async submitReview(
    userId: string,
    cardId: string,
    rating: Grade,
    timeTakenMs: number,
  ): Promise<ReviewResult> {
    // Load the card
    const cardWithNote = await this.cardService.getById(cardId, userId);
    if (!cardWithNote) {
      throw new Error("Card not found");
    }

    const now = new Date();

    // Run FSRS scheduling
    const result = scheduleFsrs(cardWithNote, rating, now);

    // Update card in DB
    await this.db
      .update(cards)
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
      .where(eq(cards.id, cardId));

    // Insert review log (captures pre-review state)
    await this.db.insert(reviewLogs).values({
      id: generateId(),
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
    });

    // Reload the card to get the updated version with noteFields
    const updated = await this.cardService.getById(cardId, userId);

    return {
      card: updated!,
      fsrs: result,
    };
  }

  async undoLastReview(
    userId: string,
    cardId: string,
  ): Promise<CardWithNote | undefined> {
    // Verify the card belongs to the user
    const cardWithNote = await this.cardService.getById(cardId, userId);
    if (!cardWithNote) {
      return undefined;
    }

    // Find the most recent review log for this card
    const lastLog = this.db
      .select()
      .from(reviewLogs)
      .where(eq(reviewLogs.cardId, cardId))
      .orderBy(desc(reviewLogs.reviewedAt))
      .limit(1)
      .get();

    if (!lastLog) {
      return undefined;
    }

    // Restore card to pre-review state from the log
    await this.db
      .update(cards)
      .set({
        due: lastLog.due,
        stability: lastLog.stability,
        difficulty: lastLog.difficulty,
        elapsedDays: lastLog.elapsedDays,
        scheduledDays: lastLog.scheduledDays,
        state: lastLog.state,
        // Restore reps and lapses by decrementing
        reps: Math.max(0, (cardWithNote.reps ?? 0) - 1),
        lapses:
          lastLog.state === 2 || lastLog.state === 3
            ? Math.max(0, (cardWithNote.lapses ?? 0) - 1)
            : cardWithNote.lapses,
        lastReview: undefined,
        updatedAt: new Date(),
      })
      .where(eq(cards.id, cardId));

    // Delete the review log entry
    await this.db.delete(reviewLogs).where(eq(reviewLogs.id, lastLog.id));

    // Reload and return updated card
    return this.cardService.getById(cardId, userId);
  }

  async getIntervalPreviews(
    userId: string,
    cardId: string,
  ): Promise<Record<number, IntervalPreview> | undefined> {
    const cardWithNote = await this.cardService.getById(cardId, userId);
    if (!cardWithNote) {
      return undefined;
    }

    return previewAll(cardWithNote);
  }
}
