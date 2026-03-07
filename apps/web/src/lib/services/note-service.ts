import { eq, and, like } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { generateId } from "../id";
import { notes, cards, cardTemplates } from "../../db/schema";

type Db = BunSQLiteDatabase<typeof import("../../db/schema")>;

type Note = typeof notes.$inferSelect;
type Card = typeof cards.$inferSelect;

export type NoteWithCards = {
  note: Note;
  cards: Card[];
};

export class NoteService {
  constructor(private db: Db) {}

  async create(
    userId: string,
    data: {
      noteTypeId: string;
      deckId: string;
      fields: Record<string, string>;
      tags?: string;
    },
  ): Promise<Note> {
    const id = generateId();
    const now = new Date();

    await this.db.insert(notes).values({
      id,
      userId,
      noteTypeId: data.noteTypeId,
      fields: data.fields,
      tags: data.tags ?? "",
      createdAt: now,
      updatedAt: now,
    });

    // Auto-generate cards: one per template in the note type
    const templates = await this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, data.noteTypeId))
      .all();

    for (const template of templates) {
      await this.db.insert(cards).values({
        id: generateId(),
        noteId: id,
        deckId: data.deckId,
        templateId: template.id,
        ordinal: template.ordinal,
        state: 0,
        due: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const note = await this.db
      .select()
      .from(notes)
      .where(eq(notes.id, id))
      .get();

    return note!;
  }

  async getById(
    id: string,
    userId: string,
  ): Promise<NoteWithCards | undefined> {
    const note = await this.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .get();

    if (!note) {
      return undefined;
    }

    const noteCards = await this.db
      .select()
      .from(cards)
      .where(eq(cards.noteId, id))
      .all();

    return { note, cards: noteCards };
  }

  async update(
    id: string,
    userId: string,
    data: { fields?: Record<string, string>; tags?: string },
  ): Promise<Note | undefined> {
    const existing = await this.db
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

    await this.db
      .update(notes)
      .set(updateData)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)));

    return this.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .get();
  }

  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .get();

    if (!existing) {
      return;
    }

    // Delete all cards for this note first
    await this.db.delete(cards).where(eq(cards.noteId, id));

    // Delete the note
    await this.db
      .delete(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)));
  }

  async listByDeck(deckId: string, userId: string): Promise<Note[]> {
    // Find notes that have cards in the given deck
    const deckCards = await this.db
      .select({ noteId: cards.noteId })
      .from(cards)
      .where(eq(cards.deckId, deckId))
      .all();

    const noteIds = [...new Set(deckCards.map((c) => c.noteId))];

    if (noteIds.length === 0) {
      return [];
    }

    const allNotes = await this.db
      .select()
      .from(notes)
      .where(eq(notes.userId, userId))
      .all();

    return allNotes.filter((n) => noteIds.includes(n.id));
  }

  async search(userId: string, query: string): Promise<Note[]> {
    // Basic text search across note fields using SQL LIKE
    const userNotes = await this.db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), like(notes.fields, `%${query}%`)))
      .all();

    return userNotes;
  }
}
