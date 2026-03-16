/**
 * Server-side sync service.
 * Provides full and delta pulls of user data for offline sync.
 */
import { eq, and, gte, sql } from "drizzle-orm";
import type { AppDb } from "../db/index";
import {
  decks,
  noteTypes,
  cardTemplates,
  notes,
  cards,
  reviewLogs,
  media,
  noteMedia,
} from "../db/schema";

type Db = AppDb;

export type SyncPullResponse = {
  decks: Array<Record<string, unknown>>;
  noteTypes: Array<Record<string, unknown>>;
  cardTemplates: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  reviewLogs: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
  noteMedia: Array<Record<string, unknown>>;
  deletions: Array<{ tableName: string; rowId: string }>;
  syncedAt: number;
};

export class SyncService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  /**
   * Full pull: returns all data for a user.
   * Used on first sync when the client has no local data.
   */
  async pullFull(userId: string): Promise<SyncPullResponse> {
    const now = Date.now();

    const userDecks = await this.db
      .select()
      .from(decks)
      .where(eq(decks.userId, userId))
      .all();

    const userNoteTypes = await this.db
      .select()
      .from(noteTypes)
      .where(eq(noteTypes.userId, userId))
      .all();

    // Card templates for user's note types
    const noteTypeIds = userNoteTypes.map((nt) => nt.id);
    let userCardTemplates: Array<Record<string, unknown>> = [];
    if (noteTypeIds.length > 0) {
      userCardTemplates = (await this.db
        .select()
        .from(cardTemplates)
        .where(
          sql`${cardTemplates.noteTypeId} IN (${sql.join(
            noteTypeIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .all()) as Array<Record<string, unknown>>;
    }

    const userNotes = await this.db
      .select()
      .from(notes)
      .where(eq(notes.userId, userId))
      .all();

    // Cards for user's notes
    const noteIds = userNotes.map((n) => n.id);
    let userCards: Array<Record<string, unknown>> = [];
    if (noteIds.length > 0) {
      userCards = (await this.db
        .select()
        .from(cards)
        .where(
          sql`${cards.noteId} IN (${sql.join(
            noteIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .all()) as Array<Record<string, unknown>>;
    }

    // Review logs for user's cards
    const cardIds = (userCards as Array<{ id: number }>).map((c) => c.id);
    let userReviewLogs: Array<Record<string, unknown>> = [];
    if (cardIds.length > 0) {
      userReviewLogs = (await this.db
        .select()
        .from(reviewLogs)
        .where(
          sql`${reviewLogs.cardId} IN (${sql.join(
            cardIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .all()) as Array<Record<string, unknown>>;
    }

    const userMedia = await this.db
      .select()
      .from(media)
      .where(eq(media.userId, userId))
      .all();

    // Note-media junctions for user's notes
    let userNoteMedia: Array<Record<string, unknown>> = [];
    if (noteIds.length > 0) {
      userNoteMedia = (await this.db
        .select()
        .from(noteMedia)
        .where(
          sql`${noteMedia.noteId} IN (${sql.join(
            noteIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .all()) as Array<Record<string, unknown>>;
    }

    return {
      decks: userDecks as Array<Record<string, unknown>>,
      noteTypes: userNoteTypes as Array<Record<string, unknown>>,
      cardTemplates: userCardTemplates,
      notes: userNotes as Array<Record<string, unknown>>,
      cards: userCards,
      reviewLogs: userReviewLogs,
      media: userMedia as Array<Record<string, unknown>>,
      noteMedia: userNoteMedia,
      deletions: [],
      syncedAt: now,
    };
  }

  /**
   * Delta pull: returns only data changed since `since` timestamp.
   * Tables with updated_at are filtered; tables without (reviewLogs, cardTemplates)
   * are returned in full if any parent was modified.
   */
  async pullDelta(userId: string, since: number): Promise<SyncPullResponse> {
    const now = Date.now();
    const sinceDate = new Date(since);

    const userDecks = await this.db
      .select()
      .from(decks)
      .where(and(eq(decks.userId, userId), gte(decks.updatedAt, sinceDate)))
      .all();

    const userNoteTypes = await this.db
      .select()
      .from(noteTypes)
      .where(
        and(eq(noteTypes.userId, userId), gte(noteTypes.updatedAt, sinceDate)),
      )
      .all();

    // For delta, re-fetch all card templates for modified note types
    const modifiedNtIds = userNoteTypes.map((nt) => nt.id);
    let userCardTemplates: Array<Record<string, unknown>> = [];
    if (modifiedNtIds.length > 0) {
      userCardTemplates = (await this.db
        .select()
        .from(cardTemplates)
        .where(
          sql`${cardTemplates.noteTypeId} IN (${sql.join(
            modifiedNtIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .all()) as Array<Record<string, unknown>>;
    }

    const userNotes = await this.db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), gte(notes.updatedAt, sinceDate)))
      .all();

    const userCards = (
      await this.db
        .select()
        .from(cards)
        .innerJoin(notes, eq(cards.noteId, notes.id))
        .where(and(eq(notes.userId, userId), gte(cards.updatedAt, sinceDate)))
        .all()
    ).map((r) => r.cards);

    // Review logs since the timestamp
    const userReviewLogs = (
      await this.db
        .select()
        .from(reviewLogs)
        .innerJoin(cards, eq(reviewLogs.cardId, cards.id))
        .innerJoin(notes, eq(cards.noteId, notes.id))
        .where(
          and(eq(notes.userId, userId), gte(reviewLogs.reviewedAt, sinceDate)),
        )
        .all()
    ).map((r) => r.review_logs);

    // Media doesn't have updated_at, so check created_at
    const userMedia = await this.db
      .select()
      .from(media)
      .where(and(eq(media.userId, userId), gte(media.createdAt, sinceDate)))
      .all();

    // Note-media for modified notes
    const modifiedNoteIds = userNotes.map((n) => n.id);
    let userNoteMedia: Array<Record<string, unknown>> = [];
    if (modifiedNoteIds.length > 0) {
      userNoteMedia = (await this.db
        .select()
        .from(noteMedia)
        .where(
          sql`${noteMedia.noteId} IN (${sql.join(
            modifiedNoteIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .all()) as Array<Record<string, unknown>>;
    }

    // Sync deletions table query will be added in a future phase

    return {
      decks: userDecks as Array<Record<string, unknown>>,
      noteTypes: userNoteTypes as Array<Record<string, unknown>>,
      cardTemplates: userCardTemplates,
      notes: userNotes as Array<Record<string, unknown>>,
      cards: userCards as Array<Record<string, unknown>>,
      reviewLogs: userReviewLogs as Array<Record<string, unknown>>,
      media: userMedia as Array<Record<string, unknown>>,
      noteMedia: userNoteMedia,
      deletions: [],
      syncedAt: now,
    };
  }
}
