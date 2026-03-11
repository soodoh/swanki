import { eq, desc, inArray, and, lte } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "../../db/schema";
import {
  cards,
  notes,
  cardTemplates,
  noteTypes,
  reviewLogs,
  decks,
} from "../../db/schema";
import { generateId } from "../id";
import { CardService } from "./card-service";
import { scheduleFsrs, previewAll } from "../fsrs";
import type { CardCounts, CardWithNote } from "./card-service";
import type { Grade, FsrsResult, IntervalPreview } from "../fsrs";

type Db = BunSQLiteDatabase<typeof schema>;

function deriveCounts(dueCards: CardWithNote[]): CardCounts {
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

export type StudyCardTemplate = {
  id: string;
  questionTemplate: string;
  answerTemplate: string;
};

export type StudySession = {
  cards: CardWithNote[];
  counts: CardCounts;
  templates: Record<string, StudyCardTemplate>;
  css: Record<string, string>;
};

export type ReviewResult = {
  card: CardWithNote;
  fsrs: FsrsResult;
};

export type CustomStudyOptions = {
  studyAhead?: number; // include cards due in the next N days
  extraNewCards?: number; // override new card limit
  tag?: string; // filter by tag
  previewMode?: boolean; // flag: client uses this to skip review submission
};

export class StudyService {
  private cardService: CardService;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.cardService = new CardService(db);
  }

  getStudySession(userId: string, deckId: string): StudySession {
    const dueCards = this.cardService.getDueCards(userId, deckId, {
      includeChildren: true,
    });

    // Derive counts from the due cards list (not getCounts which counts ALL cards)
    const counts = deriveCounts(dueCards);

    // Add pending learning/relearning cards (future due but in learning state)
    const deckIds = [
      deckId,
      ...this.cardService.getDescendantDeckIds(deckId, userId),
    ];
    counts.learning += this.cardService.getPendingLearningCount(
      userId,
      deckIds,
    );

    // Collect unique template IDs from the due cards
    const templateIds = [...new Set(dueCards.map((c) => c.templateId))];

    // Fetch templates
    const templateMap: Record<string, StudyCardTemplate> = {};
    if (templateIds.length > 0) {
      const templates = this.db
        .select()
        .from(cardTemplates)
        .where(inArray(cardTemplates.id, templateIds))
        .all();

      for (const t of templates) {
        templateMap[t.id] = {
          id: t.id,
          questionTemplate: t.questionTemplate,
          answerTemplate: t.answerTemplate,
        };
      }
    }

    // Collect unique note IDs to find note types for CSS
    const noteIds = [...new Set(dueCards.map((c) => c.noteId))];
    const cssMap: Record<string, string> = {};
    if (noteIds.length > 0) {
      const noteRows = this.db
        .select({ noteId: notes.id, noteTypeId: notes.noteTypeId })
        .from(notes)
        .where(inArray(notes.id, noteIds))
        .all();

      const noteTypeIds = [...new Set(noteRows.map((n) => n.noteTypeId))];
      if (noteTypeIds.length > 0) {
        const noteTypeRows = this.db
          .select({ id: noteTypes.id, css: noteTypes.css })
          .from(noteTypes)
          .where(inArray(noteTypes.id, noteTypeIds))
          .all();

        for (const nt of noteTypeRows) {
          cssMap[nt.id] = nt.css ?? "";
        }
      }
    }

    return {
      cards: dueCards,
      counts,
      templates: templateMap,
      css: cssMap,
    };
  }

  getCustomSession(
    userId: string,
    deckId: string,
    options: CustomStudyOptions,
  ): StudySession {
    const now = new Date();

    // Determine the cutoff date for due cards
    let dueCutoff = now;
    if (options.studyAhead && options.studyAhead > 0) {
      dueCutoff = new Date(
        now.getTime() + options.studyAhead * 24 * 60 * 60 * 1000,
      );
    }

    // Get deck settings
    const deck = this.db
      .select()
      .from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.userId, userId)))
      .get();

    if (!deck) {
      return {
        cards: [],
        counts: { new: 0, learning: 0, review: 0 },
        templates: {},
        css: {},
      };
    }

    const settings = deck.settings ?? {
      newCardsPerDay: 20,
      maxReviewsPerDay: 200,
    };

    // Query cards due by cutoff
    const dueRows = this.db
      .select({
        card: cards,
        noteFields: notes.fields,
        tags: notes.tags,
      })
      .from(cards)
      .innerJoin(notes, eq(cards.noteId, notes.id))
      .where(
        and(
          eq(notes.userId, userId),
          eq(cards.deckId, deckId),
          lte(cards.due, dueCutoff),
        ),
      )
      .all();

    // Filter by tag if specified
    let filteredRows = dueRows;
    if (options.tag) {
      const tagFilter = options.tag.toLowerCase();
      filteredRows = dueRows.filter((row) => {
        const tags = (row.tags ?? "").toLowerCase();
        return tags.split(/[\s,]+/).some((t) => t === tagFilter);
      });
    }

    // Separate by category
    const reviewCards: CardWithNote[] = [];
    const learningCards: CardWithNote[] = [];
    const newCards: CardWithNote[] = [];

    for (const row of filteredRows) {
      const cardWithNote: CardWithNote = {
        ...row.card,
        noteFields: row.noteFields,
      };

      const state = row.card.state ?? 0;
      if (state === 2 || state === 3) {
        reviewCards.push(cardWithNote);
      } else if (state === 1) {
        learningCards.push(cardWithNote);
      } else {
        newCards.push(cardWithNote);
      }
    }

    // Apply limits (extraNewCards overrides the default new card limit)
    const newCardLimit = options.extraNewCards
      ? settings.newCardsPerDay + options.extraNewCards
      : settings.newCardsPerDay;
    const limitedReviews = reviewCards.slice(0, settings.maxReviewsPerDay);
    const limitedNew = newCards.slice(0, newCardLimit);

    const allCards = [...limitedReviews, ...learningCards, ...limitedNew];

    // Collect templates
    const templateIds = [...new Set(allCards.map((c) => c.templateId))];
    const templateMap: Record<string, StudyCardTemplate> = {};
    if (templateIds.length > 0) {
      const templates = this.db
        .select()
        .from(cardTemplates)
        .where(inArray(cardTemplates.id, templateIds))
        .all();

      for (const t of templates) {
        templateMap[t.id] = {
          id: t.id,
          questionTemplate: t.questionTemplate,
          answerTemplate: t.answerTemplate,
        };
      }
    }

    // Collect CSS
    const noteIds = [...new Set(allCards.map((c) => c.noteId))];
    const cssMap: Record<string, string> = {};
    if (noteIds.length > 0) {
      const noteRows = this.db
        .select({ noteId: notes.id, noteTypeId: notes.noteTypeId })
        .from(notes)
        .where(inArray(notes.id, noteIds))
        .all();

      const noteTypeIds = [...new Set(noteRows.map((n) => n.noteTypeId))];
      if (noteTypeIds.length > 0) {
        const noteTypeRows = this.db
          .select({ id: noteTypes.id, css: noteTypes.css })
          .from(noteTypes)
          .where(inArray(noteTypes.id, noteTypeIds))
          .all();

        for (const nt of noteTypeRows) {
          cssMap[nt.id] = nt.css ?? "";
        }
      }
    }

    // Derive counts from the filtered cards list
    const counts = deriveCounts(allCards);

    // Add pending learning/relearning cards (future due but in learning state)
    counts.learning += this.cardService.getPendingLearningCount(userId, [
      deckId,
    ]);

    return {
      cards: allCards,
      counts,
      templates: templateMap,
      css: cssMap,
    };
  }

  submitReview(
    userId: string,
    cardId: string,
    rating: Grade,
    timeTakenMs: number,
  ): ReviewResult {
    // Load the card
    const cardWithNote = this.cardService.getById(cardId, userId);
    if (!cardWithNote) {
      throw new Error("Card not found");
    }

    const now = new Date();

    // Run FSRS scheduling
    const result = scheduleFsrs(cardWithNote, rating, now);

    // Update card in DB
    this.db
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
      .where(eq(cards.id, cardId))
      .run();

    // Insert review log (captures pre-review state)
    this.db
      .insert(reviewLogs)
      .values({
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
      })
      .run();

    // Reload the card to get the updated version with noteFields
    const updated = this.cardService.getById(cardId, userId);

    return {
      card: updated!,
      fsrs: result,
    };
  }

  undoLastReview(userId: string, cardId: string): CardWithNote | undefined {
    // Verify the card belongs to the user
    const cardWithNote = this.cardService.getById(cardId, userId);
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
    this.db
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
      .where(eq(cards.id, cardId))
      .run();

    // Delete the review log entry
    this.db.delete(reviewLogs).where(eq(reviewLogs.id, lastLog.id)).run();

    // Reload and return updated card
    return this.cardService.getById(cardId, userId);
  }

  getIntervalPreviews(
    userId: string,
    cardId: string,
  ): Record<number, IntervalPreview> | undefined {
    const cardWithNote = this.cardService.getById(cardId, userId);
    if (!cardWithNote) {
      return undefined;
    }

    return previewAll(cardWithNote);
  }
}
