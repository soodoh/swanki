import { eq, and, like } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { generateId } from "../id";
import type * as schema from "../../db/schema";
import { notes, cards, cardTemplates } from "../../db/schema";

type Db = BunSQLiteDatabase<typeof schema>;

type Note = typeof notes.$inferSelect;
type Card = typeof cards.$inferSelect;

export type NoteWithCards = {
  note: Note;
  cards: Card[];
};

export class NoteService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  create(
    userId: string,
    data: {
      noteTypeId: string;
      deckId: string;
      fields: Record<string, string>;
      tags?: string;
    },
  ): Note {
    const id = generateId();
    const now = new Date();

    this.db
      .insert(notes)
      .values({
        id,
        userId,
        noteTypeId: data.noteTypeId,
        fields: data.fields,
        tags: data.tags ?? "",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Auto-generate cards: one per template in the note type
    const templates = this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, data.noteTypeId))
      .all();

    for (const template of templates) {
      this.db
        .insert(cards)
        .values({
          id: generateId(),
          noteId: id,
          deckId: data.deckId,
          templateId: template.id,
          ordinal: template.ordinal,
          state: 0,
          due: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    const note = this.db.select().from(notes).where(eq(notes.id, id)).get();

    return note!;
  }

  getById(id: string, userId: string): NoteWithCards | undefined {
    const note = this.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .get();

    if (!note) {
      return undefined;
    }

    const noteCards = this.db
      .select()
      .from(cards)
      .where(eq(cards.noteId, id))
      .all();

    return { note, cards: noteCards };
  }

  update(
    id: string,
    userId: string,
    data: { fields?: Record<string, string>; tags?: string },
  ): Note | undefined {
    const existing = this.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .get();

    if (!existing) {
      return undefined;
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.fields !== undefined) {
      updateData.fields = data.fields;
    }
    if (data.tags !== undefined) {
      updateData.tags = data.tags;
    }

    this.db
      .update(notes)
      .set(updateData)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .run();

    return this.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .get();
  }

  delete(id: string, userId: string): void {
    const existing = this.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .get();

    if (!existing) {
      return;
    }

    // Delete all cards for this note first
    this.db.delete(cards).where(eq(cards.noteId, id)).run();

    // Delete the note
    this.db
      .delete(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .run();
  }

  listByDeck(deckId: string, userId: string): Note[] {
    // Find notes that have cards in the given deck
    const deckCards = this.db
      .select({ noteId: cards.noteId })
      .from(cards)
      .where(eq(cards.deckId, deckId))
      .all();

    const noteIds = [...new Set(deckCards.map((c) => c.noteId))];

    if (noteIds.length === 0) {
      return [];
    }

    const allNotes = this.db
      .select()
      .from(notes)
      .where(eq(notes.userId, userId))
      .all();

    return allNotes.filter((n) => noteIds.includes(n.id));
  }

  search(userId: string, query: string): Note[] {
    // Basic text search across note fields using SQL LIKE
    const userNotes = this.db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), like(notes.fields, `%${query}%`)))
      .all();

    return userNotes;
  }
}
