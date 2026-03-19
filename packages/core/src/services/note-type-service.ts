import { eq, and } from "drizzle-orm";
import type { AppDb } from "../db/index";
import { noteTypes, cardTemplates, notes } from "../db/schema";

type Db = AppDb;

type NoteType = typeof noteTypes.$inferSelect;
type CardTemplate = typeof cardTemplates.$inferSelect;

export type NoteTypeWithTemplates = {
  noteType: NoteType;
  templates: CardTemplate[];
};

export class NoteTypeService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async create(
    userId: string,
    data: {
      name: string;
      fields: Array<{ name: string; ordinal: number }>;
      css?: string;
    },
  ): Promise<NoteType> {
    const now = new Date();

    const noteType = await this.db
      .insert(noteTypes)
      .values({
        userId,
        name: data.name,
        fields: data.fields,
        css: data.css ?? "",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return noteType;
  }

  async addTemplate(
    noteTypeId: string,
    userId: string,
    data: {
      name: string;
      questionTemplate: string;
      answerTemplate: string;
    },
  ): Promise<CardTemplate | undefined> {
    // Verify ownership of the note type
    const noteType = await this.db
      .select()
      .from(noteTypes)
      .where(and(eq(noteTypes.id, noteTypeId), eq(noteTypes.userId, userId)))
      .get();

    if (!noteType) {
      return undefined;
    }

    // Determine the next ordinal
    const existing = await this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, noteTypeId))
      .all();

    const ordinal =
      existing.length > 0 ? Math.max(...existing.map((t) => t.ordinal)) + 1 : 0;

    const now = new Date();
    const template = await this.db
      .insert(cardTemplates)
      .values({
        noteTypeId,
        name: data.name,
        ordinal,
        questionTemplate: data.questionTemplate,
        answerTemplate: data.answerTemplate,
        updatedAt: now,
      })
      .returning()
      .get();

    return template;
  }

  async getFirstNoteFields(
    noteTypeId: string,
    userId: string,
  ): Promise<Record<string, string> | undefined> {
    const row = await this.db
      .select({ fields: notes.fields })
      .from(notes)
      .where(and(eq(notes.noteTypeId, noteTypeId), eq(notes.userId, userId)))
      .limit(1)
      .get();
    return row?.fields;
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
    userId: string,
    data: { questionTemplate?: string; answerTemplate?: string },
  ): Promise<CardTemplate | undefined> {
    // Verify ownership: template -> noteType -> user
    const existing = await this.db
      .select()
      .from(cardTemplates)
      .innerJoin(noteTypes, eq(cardTemplates.noteTypeId, noteTypes.id))
      .where(
        and(eq(cardTemplates.id, templateId), eq(noteTypes.userId, userId)),
      )
      .get();

    if (!existing) {
      return undefined;
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.questionTemplate !== undefined) {
      updateData.questionTemplate = data.questionTemplate;
    }
    if (data.answerTemplate !== undefined) {
      updateData.answerTemplate = data.answerTemplate;
    }

    await this.db
      .update(cardTemplates)
      .set(updateData)
      .where(eq(cardTemplates.id, templateId))
      .run();

    return await this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.id, templateId))
      .get();
  }

  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    // Verify ownership: template -> noteType -> user
    const existing = await this.db
      .select()
      .from(cardTemplates)
      .innerJoin(noteTypes, eq(cardTemplates.noteTypeId, noteTypes.id))
      .where(
        and(eq(cardTemplates.id, templateId), eq(noteTypes.userId, userId)),
      )
      .get();

    if (!existing) {
      return;
    }

    await this.db
      .delete(cardTemplates)
      .where(eq(cardTemplates.id, templateId))
      .run();
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
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .run();

    return await this.db
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
    await this.db
      .delete(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, id))
      .run();

    // Delete the note type
    await this.db
      .delete(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .run();
  }
}
