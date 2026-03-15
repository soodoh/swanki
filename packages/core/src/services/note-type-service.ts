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

  create(
    userId: string,
    data: {
      name: string;
      fields: Array<{ name: string; ordinal: number }>;
      css?: string;
    },
  ): NoteType {
    const now = new Date();

    const noteType = this.db
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

  addTemplate(
    noteTypeId: number,
    userId: string,
    data: {
      name: string;
      questionTemplate: string;
      answerTemplate: string;
    },
  ): CardTemplate | undefined {
    // Verify ownership of the note type
    const noteType = this.db
      .select()
      .from(noteTypes)
      .where(and(eq(noteTypes.id, noteTypeId), eq(noteTypes.userId, userId)))
      .get();

    if (!noteType) {
      return undefined;
    }

    // Determine the next ordinal
    const existing = this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, noteTypeId))
      .all();

    const ordinal =
      existing.length > 0 ? Math.max(...existing.map((t) => t.ordinal)) + 1 : 0;

    const template = this.db
      .insert(cardTemplates)
      .values({
        noteTypeId,
        name: data.name,
        ordinal,
        questionTemplate: data.questionTemplate,
        answerTemplate: data.answerTemplate,
      })
      .returning()
      .get();

    return template;
  }

  getFirstNoteFields(
    noteTypeId: number,
    userId: string,
  ): Record<string, string> | undefined {
    const row = this.db
      .select({ fields: notes.fields })
      .from(notes)
      .where(and(eq(notes.noteTypeId, noteTypeId), eq(notes.userId, userId)))
      .limit(1)
      .get();
    return row?.fields;
  }

  getById(id: number, userId: string): NoteTypeWithTemplates | undefined {
    const noteType = this.db
      .select()
      .from(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .get();

    if (!noteType) {
      return undefined;
    }

    const templates = this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, id))
      .all();

    return { noteType, templates };
  }

  listByUser(userId: string): NoteTypeWithTemplates[] {
    const allNoteTypes = this.db
      .select()
      .from(noteTypes)
      .where(eq(noteTypes.userId, userId))
      .all();

    const results: NoteTypeWithTemplates[] = [];

    for (const noteType of allNoteTypes) {
      const templates = this.db
        .select()
        .from(cardTemplates)
        .where(eq(cardTemplates.noteTypeId, noteType.id))
        .all();

      results.push({ noteType, templates });
    }

    return results;
  }

  updateTemplate(
    templateId: number,
    userId: string,
    data: { questionTemplate?: string; answerTemplate?: string },
  ): CardTemplate | undefined {
    // Verify ownership: template -> noteType -> user
    const existing = this.db
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

    const updateData: Record<string, unknown> = {};
    if (data.questionTemplate !== undefined) {
      updateData.questionTemplate = data.questionTemplate;
    }
    if (data.answerTemplate !== undefined) {
      updateData.answerTemplate = data.answerTemplate;
    }

    this.db
      .update(cardTemplates)
      .set(updateData)
      .where(eq(cardTemplates.id, templateId))
      .run();

    return this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.id, templateId))
      .get();
  }

  deleteTemplate(templateId: number, userId: string): void {
    // Verify ownership: template -> noteType -> user
    const existing = this.db
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

    this.db.delete(cardTemplates).where(eq(cardTemplates.id, templateId)).run();
  }

  update(
    id: number,
    userId: string,
    data: {
      name?: string;
      fields?: Array<{ name: string; ordinal: number }>;
      css?: string;
    },
  ): NoteType | undefined {
    const existing = this.db
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

    this.db
      .update(noteTypes)
      .set(updateData)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .run();

    return this.db
      .select()
      .from(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .get();
  }

  delete(id: number, userId: string): void {
    const existing = this.db
      .select()
      .from(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .get();

    if (!existing) {
      return;
    }

    // Check if any notes reference this note type
    const referencingNotes = this.db
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
    this.db.delete(cardTemplates).where(eq(cardTemplates.noteTypeId, id)).run();

    // Delete the note type
    this.db
      .delete(noteTypes)
      .where(and(eq(noteTypes.id, id), eq(noteTypes.userId, userId)))
      .run();
  }
}
