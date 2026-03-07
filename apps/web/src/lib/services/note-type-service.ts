import { eq, and } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { generateId } from "../id";
import { noteTypes, cardTemplates, notes } from "../../db/schema";

type Db = BunSQLiteDatabase<typeof import("../../db/schema")>;

type NoteType = typeof noteTypes.$inferSelect;
type CardTemplate = typeof cardTemplates.$inferSelect;

export type NoteTypeWithTemplates = {
  noteType: NoteType;
  templates: CardTemplate[];
};

export class NoteTypeService {
  constructor(private db: Db) {}

  async create(
    userId: string,
    data: {
      name: string;
      fields: Array<{ name: string; ordinal: number }>;
      css?: string;
    },
  ): Promise<NoteType> {
    const id = generateId();
    const now = new Date();

    await this.db.insert(noteTypes).values({
      id,
      userId,
      name: data.name,
      fields: data.fields,
      css: data.css ?? "",
      createdAt: now,
      updatedAt: now,
    });

    const noteType = await this.db
      .select()
      .from(noteTypes)
      .where(eq(noteTypes.id, id))
      .get();

    return noteType!;
  }

  async addTemplate(
    noteTypeId: string,
    data: {
      name: string;
      questionTemplate: string;
      answerTemplate: string;
    },
  ): Promise<CardTemplate> {
    const id = generateId();

    // Determine the next ordinal
    const existing = await this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, noteTypeId))
      .all();

    const ordinal =
      existing.length > 0 ? Math.max(...existing.map((t) => t.ordinal)) + 1 : 0;

    await this.db.insert(cardTemplates).values({
      id,
      noteTypeId,
      name: data.name,
      ordinal,
      questionTemplate: data.questionTemplate,
      answerTemplate: data.answerTemplate,
    });

    const template = await this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.id, id))
      .get();

    return template!;
  }

  async getById(
    id: string,
    userId: string,
  ): Promise<NoteTypeWithTemplates | undefined> {
    const noteType = await this.db
      .select()
      .from(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .get();

    if (!noteType) {
      return undefined;
    }

    const templates = await this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, id))
      .all();

    return { noteType, templates };
  }

  async listByUser(userId: string): Promise<NoteTypeWithTemplates[]> {
    const allNoteTypes = await this.db
      .select()
      .from(noteTypes)
      .where(eq(noteTypes.userId, userId))
      .all();

    const results: NoteTypeWithTemplates[] = [];

    for (const noteType of allNoteTypes) {
      const templates = await this.db
        .select()
        .from(cardTemplates)
        .where(eq(cardTemplates.noteTypeId, noteType.id))
        .all();

      results.push({ noteType, templates });
    }

    return results;
  }

  async updateTemplate(
    templateId: string,
    data: { questionTemplate?: string; answerTemplate?: string },
  ): Promise<CardTemplate | undefined> {
    const existing = await this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.id, templateId))
      .get();

    if (!existing) {
      return undefined;
    }

    const updateData: Record<string, unknown> = {};
    if (data.questionTemplate !== undefined) {
      updateData.questionTemplate = data.questionTemplate;
    }
    if (data.answerTemplate !== undefined) {
      updateData.answerTemplate = data.answerTemplate;
    }

    await this.db
      .update(cardTemplates)
      .set(updateData)
      .where(eq(cardTemplates.id, templateId));

    return this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.id, templateId))
      .get();
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await this.db.delete(cardTemplates).where(eq(cardTemplates.id, templateId));
  }

  async update(
    id: string,
    userId: string,
    data: {
      name?: string;
      fields?: Array<{ name: string; ordinal: number }>;
      css?: string;
    },
  ): Promise<NoteType | undefined> {
    const existing = await this.db
      .select()
      .from(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .get();

    if (!existing) {
      return undefined;
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.fields !== undefined) {
      updateData.fields = data.fields;
    }
    if (data.css !== undefined) {
      updateData.css = data.css;
    }

    await this.db
      .update(noteTypes)
      .set(updateData)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)));

    return this.db
      .select()
      .from(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .get();
  }

  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .get();

    if (!existing) {
      return;
    }

    // Check if any notes reference this note type
    const referencingNotes = await this.db
      .select()
      .from(notes)
      .where(eq(notes.noteTypeId, id))
      .all();

    if (referencingNotes.length > 0) {
      throw new Error(
        "Cannot delete note type that is referenced by existing notes",
      );
    }

    // Delete all templates first
    await this.db.delete(cardTemplates).where(eq(cardTemplates.noteTypeId, id));

    // Delete the note type
    await this.db
      .delete(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)));
  }
}
