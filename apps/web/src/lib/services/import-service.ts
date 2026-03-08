import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { generateId } from "../id";
import type * as schema from "../../db/schema";
import {
  decks,
  noteTypes,
  cardTemplates,
  notes,
  cards,
  noteMedia,
  media,
} from "../../db/schema";
import { parseCrowdAnki } from "../import/crowdanki-parser";
import type { CrowdAnkiData } from "../import/crowdanki-parser";
import type { ApkgData } from "../import/apkg-parser";

type Db = BunSQLiteDatabase<typeof schema>;

export type ImportFormat = "apkg" | "colpkg" | "csv" | "txt" | "crowdanki";

export type CsvImportOptions = {
  headers?: string[];
  rows: string[][];
  deckName?: string;
};

export type ImportResult = {
  deckId?: string;
  deckCount?: number;
  noteCount: number;
  cardCount: number;
};

const FORMAT_MAP: Record<string, ImportFormat> = {
  ".apkg": "apkg",
  ".colpkg": "colpkg",
  ".csv": "csv",
  ".txt": "txt",
  ".json": "crowdanki",
};

export function detectFormat(filename: string): ImportFormat | undefined {
  const lower = filename.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex === -1) {
    return undefined;
  }

  const ext = lower.slice(dotIndex);
  return FORMAT_MAP[ext];
}

export function rewriteMediaUrls(
  text: string,
  mapping: Map<string, string>,
): string {
  let result = text;

  // Rewrite src="filename" (handles img, audio, video source tags)
  // oxlint-disable-next-line unicorn(prefer-string-replace-all) -- replaceAll triggers no-unsafe-* lint errors
  result = result.replace(/src="([^"]+)"/g, (match, filename: string) => {
    const newUrl = mapping.get(filename);
    return newUrl ? `src="${newUrl}"` : match;
  });

  // Rewrite [sound:filename] (Anki audio syntax)
  // oxlint-disable-next-line unicorn(prefer-string-replace-all) -- replaceAll triggers no-unsafe-* lint errors
  result = result.replace(/\[sound:([^\]]+)\]/g, (match, filename: string) => {
    const newUrl = mapping.get(filename);
    return newUrl ? `[sound:${newUrl}]` : match;
  });

  return result;
}

export function extractMediaFilenames(
  fields: Record<string, string>,
): string[] {
  const filenames: string[] = [];
  const allText = Object.values(fields).join(" ");

  const srcRegex = /\/api\/media\/([^\s"'<>\]]+)/g;
  let match;
  while ((match = srcRegex.exec(allText)) !== null) {
    filenames.push(match[1]);
  }

  return [...new Set(filenames)];
}

export class ImportService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  importFromCsv(userId: string, options: CsvImportOptions): ImportResult {
    const deckName = options.deckName ?? "CSV Import";
    const { rows } = options;

    if (rows.length === 0) {
      // Still create the deck, but no notes/cards
      const deckId = generateId();
      const now = new Date();
      this.db
        .insert(decks)
        .values({
          id: deckId,
          userId,
          name: deckName,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      return { deckId, noteCount: 0, cardCount: 0 };
    }

    // Determine field names
    const fieldCount = rows[0].length;
    const fieldNames =
      options.headers ??
      Array.from({ length: fieldCount }, (_, i) => `Field ${i + 1}`);

    // Create deck
    const deckId = generateId();
    const now = new Date();
    this.db
      .insert(decks)
      .values({
        id: deckId,
        userId,
        name: deckName,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Create note type
    const noteTypeId = generateId();
    const fields = fieldNames.map((name, i) => ({ name, ordinal: i }));
    this.db
      .insert(noteTypes)
      .values({
        id: noteTypeId,
        userId,
        name: `${deckName} - Note Type`,
        fields,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Create a basic card template
    const templateId = generateId();
    const firstField = fieldNames[0];
    const remainingFields = fieldNames.slice(1);
    const answerContent =
      remainingFields.length > 0
        ? remainingFields.map((f) => `{{${f}}}`).join("<br>")
        : `{{${firstField}}}`;

    this.db
      .insert(cardTemplates)
      .values({
        id: templateId,
        noteTypeId,
        name: "Card 1",
        ordinal: 0,
        questionTemplate: `{{${firstField}}}`,
        answerTemplate: answerContent,
      })
      .run();

    // Create notes and cards
    let noteCount = 0;
    let cardCount = 0;

    for (const row of rows) {
      const noteId = generateId();
      const noteFields: Record<string, string> = {};
      for (let i = 0; i < fieldNames.length; i += 1) {
        noteFields[fieldNames[i]] = row[i] ?? "";
      }

      this.db
        .insert(notes)
        .values({
          id: noteId,
          userId,
          noteTypeId,
          fields: noteFields,
          tags: "",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      noteCount += 1;

      this.db
        .insert(cards)
        .values({
          id: generateId(),
          noteId,
          deckId,
          templateId,
          ordinal: 0,
          state: 0,
          due: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      cardCount += 1;
    }

    return { deckId, noteCount, cardCount };
  }

  importFromCrowdAnki(userId: string, json: unknown): ImportResult {
    const data = parseCrowdAnki(json);

    let deckCount = 0;
    let noteCount = 0;
    let cardCount = 0;

    // Build a map of model UUID -> our note type ID
    const modelMap = new Map<string, string>();

    // Create note types from all models in the data
    const now = new Date();
    for (const model of data.noteModels) {
      const noteTypeId = generateId();
      modelMap.set(model.uuid, noteTypeId);

      const fields = model.fields.map((f) => ({
        name: f.name,
        ordinal: f.ordinal,
      }));

      this.db
        .insert(noteTypes)
        .values({
          id: noteTypeId,
          userId,
          name: model.name,
          fields,
          css: model.css,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Create templates
      for (const tmpl of model.templates) {
        this.db
          .insert(cardTemplates)
          .values({
            id: generateId(),
            noteTypeId,
            name: tmpl.name,
            ordinal: tmpl.ordinal,
            questionTemplate: tmpl.questionFormat,
            answerTemplate: tmpl.answerFormat,
          })
          .run();
      }
    }

    // Recursively create decks and notes
    const importResult = this.importCrowdAnkiDeck(
      userId,
      data,
      modelMap,
      undefined,
      now,
    );

    deckCount += importResult.deckCount;
    noteCount += importResult.noteCount;
    cardCount += importResult.cardCount;

    return { deckCount, noteCount, cardCount };
  }

  private importCrowdAnkiDeck(
    userId: string,
    data: CrowdAnkiData,
    modelMap: Map<string, string>,
    parentId: string | undefined,
    now: Date,
  ): { deckCount: number; noteCount: number; cardCount: number } {
    let deckCount = 0;
    let noteCount = 0;
    let cardCount = 0;

    // Create deck
    const deckId = generateId();
    this.db
      .insert(decks)
      .values({
        id: deckId,
        userId,
        name: data.name,
        parentId: parentId ?? undefined,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    deckCount += 1;

    // Create notes for this deck
    for (const note of data.notes) {
      const noteTypeId = modelMap.get(note.noteModelUuid);
      if (!noteTypeId) {
        continue;
      }

      const noteId = generateId();

      // Get the note type to map field indices to field names
      const noteType = this.db
        .select()
        .from(noteTypes)
        .where(eq(noteTypes.id, noteTypeId))
        .get();

      if (!noteType) {
        continue;
      }

      const fieldDefs = noteType.fields as Array<{
        name: string;
        ordinal: number;
      }>;
      const noteFields: Record<string, string> = {};
      for (const field of fieldDefs) {
        noteFields[field.name] = note.fields[field.ordinal] ?? "";
      }

      this.db
        .insert(notes)
        .values({
          id: noteId,
          userId,
          noteTypeId,
          fields: noteFields,
          tags: note.tags.join(" "),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      noteCount += 1;

      // Get templates for this note type and create cards
      const templates = this.db
        .select()
        .from(cardTemplates)
        .where(eq(cardTemplates.noteTypeId, noteTypeId))
        .all();

      for (const template of templates) {
        this.db
          .insert(cards)
          .values({
            id: generateId(),
            noteId,
            deckId,
            templateId: template.id,
            ordinal: template.ordinal,
            state: 0,
            due: now,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        cardCount += 1;
      }
    }

    // Recursively handle children
    for (const child of data.children) {
      const childResult = this.importCrowdAnkiDeck(
        userId,
        child,
        modelMap,
        deckId,
        now,
      );
      deckCount += childResult.deckCount;
      noteCount += childResult.noteCount;
      cardCount += childResult.cardCount;
    }

    return { deckCount, noteCount, cardCount };
  }

  importFromApkg(
    userId: string,
    data: ApkgData,
    mediaMapping?: Map<string, string>,
  ): ImportResult {
    const now = new Date();
    let noteCount = 0;
    let cardCount = 0;

    // Create decks, mapping anki deck id -> our deck id
    const deckMap = new Map<number, string>();
    for (const ankiDeck of data.decks) {
      const deckId = generateId();
      deckMap.set(ankiDeck.id, deckId);

      this.db
        .insert(decks)
        .values({
          id: deckId,
          userId,
          name: ankiDeck.name,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    // Create note types, mapping anki model id -> our note type id
    const noteTypeMap = new Map<number, string>();
    const templateMap = new Map<string, string>();
    for (const ankiNoteType of data.noteTypes) {
      const noteTypeId = generateId();
      noteTypeMap.set(ankiNoteType.id, noteTypeId);

      const fields = ankiNoteType.fields.map((f) => ({
        name: f.name,
        ordinal: f.ordinal,
      }));

      this.db
        .insert(noteTypes)
        .values({
          id: noteTypeId,
          userId,
          name: ankiNoteType.name,
          fields,
          css: ankiNoteType.css,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Create templates
      for (const tmpl of ankiNoteType.templates) {
        const tmplId = generateId();
        this.db
          .insert(cardTemplates)
          .values({
            id: tmplId,
            noteTypeId,
            name: tmpl.name,
            ordinal: tmpl.ordinal,
            questionTemplate: tmpl.questionFormat,
            answerTemplate: tmpl.answerFormat,
          })
          .run();
        templateMap.set(`${noteTypeId}:${tmpl.ordinal}`, tmplId);
      }
    }

    // Create notes, mapping anki note id -> our note id
    const noteMap = new Map<number, string>();
    for (const ankiNote of data.notes) {
      const noteId = generateId();
      noteMap.set(ankiNote.id, noteId);

      const noteTypeId = noteTypeMap.get(ankiNote.modelId);
      if (!noteTypeId) {
        continue;
      }

      // Get the note type fields to map indices to names
      const ankiNoteType = data.noteTypes.find(
        (nt) => nt.id === ankiNote.modelId,
      );
      const noteFields: Record<string, string> = {};
      if (ankiNoteType) {
        for (const field of ankiNoteType.fields) {
          noteFields[field.name] = ankiNote.fields[field.ordinal] ?? "";
        }
      }

      // Rewrite media URLs if mapping is provided
      if (mediaMapping) {
        for (const fieldName of Object.keys(noteFields)) {
          noteFields[fieldName] = rewriteMediaUrls(
            noteFields[fieldName],
            mediaMapping,
          );
        }
      }

      this.db
        .insert(notes)
        .values({
          id: noteId,
          userId,
          noteTypeId,
          fields: noteFields,
          tags: ankiNote.tags.trim(),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Track media references
      if (mediaMapping) {
        const mediaFilenames = extractMediaFilenames(noteFields);
        for (const filename of mediaFilenames) {
          const mediaRecord = this.db
            .select()
            .from(media)
            .where(eq(media.filename, filename))
            .get();
          if (mediaRecord) {
            this.db
              .insert(noteMedia)
              .values({
                id: generateId(),
                noteId,
                mediaId: mediaRecord.id,
              })
              .onConflictDoNothing()
              .run();
          }
        }
      }

      noteCount += 1;
    }

    // Create cards
    for (const ankiCard of data.cards) {
      const noteId = noteMap.get(ankiCard.noteId);
      const deckId = deckMap.get(ankiCard.deckId);
      if (!noteId || !deckId) {
        continue;
      }

      // Find the note for this card
      const ankiNote = data.notes.find((n) => n.id === ankiCard.noteId);
      if (!ankiNote) {
        continue;
      }

      const noteTypeId = noteTypeMap.get(ankiNote.modelId);
      if (!noteTypeId) {
        continue;
      }

      // Look up the correct template by note type and ordinal
      const templateId = templateMap.get(`${noteTypeId}:${ankiCard.ordinal}`);
      if (!templateId) {
        continue;
      }

      this.db
        .insert(cards)
        .values({
          id: generateId(),
          noteId,
          deckId,
          templateId,
          ordinal: ankiCard.ordinal,
          state: ankiCard.type,
          due: now,
          reps: ankiCard.reps,
          lapses: ankiCard.lapses,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      cardCount += 1;
    }

    return {
      deckCount: data.decks.length,
      noteCount,
      cardCount,
    };
  }
}
