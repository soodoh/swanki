import { eq, and, isNull, sql } from "drizzle-orm";
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
import { stripHtmlToPlainText } from "../field-converter";

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
  duplicatesSkipped?: number;
  notesUpdated?: number;
};

function fieldsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every((key) => a[key] === b[key]);
}

const FORMAT_MAP: Record<string, ImportFormat> = {
  ".apkg": "apkg",
  ".colpkg": "colpkg",
  ".csv": "csv",
  ".txt": "txt",
  ".zip": "crowdanki",
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

/* oxlint-disable unicorn(prefer-string-replace-all) -- replaceAll triggers no-unsafe-* lint errors */
export function rewriteMediaUrls(
  text: string,
  mapping: Map<string, string>,
): string {
  let result = text;

  // Rewrite <img src="filename"> → [image:hash.ext]
  // Supports double quotes, single quotes, and unquoted src values
  result = result.replace(
    /<img\s[^>]*src=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*\/?>/gi,
    (
      match,
      dq: string | undefined,
      sq: string | undefined,
      uq: string | undefined,
    ) => {
      const filename = dq ?? sq ?? uq;
      if (!filename) {
        return match;
      }
      const newFilename = mapping.get(filename);
      return newFilename ? `[image:${newFilename}]` : match;
    },
  );

  // Rewrite [sound:filename] → [audio:hash.ext]
  result = result.replace(/\[sound:([^\]]+)\]/g, (match, filename: string) => {
    const newFilename = mapping.get(filename);
    return newFilename ? `[audio:${newFilename}]` : match;
  });

  // Rewrite <video src="filename"...>...</video> → [video:hash.ext]
  // Supports double quotes, single quotes, and unquoted src values
  result = result.replace(
    /<video\s[^>]*src=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>[\s\S]*?<\/video>/gi,
    (
      match,
      dq: string | undefined,
      sq: string | undefined,
      uq: string | undefined,
    ) => {
      const filename = dq ?? sq ?? uq;
      if (!filename) {
        return match;
      }
      const newFilename = mapping.get(filename);
      return newFilename ? `[video:${newFilename}]` : match;
    },
  );

  return result;
}
/* oxlint-enable unicorn(prefer-string-replace-all) */

export function extractMediaFilenames(
  fields: Record<string, string>,
): string[] {
  const filenames: string[] = [];
  const allText = Object.values(fields).join(" ");

  // Match [image:file], [audio:file], [video:file] bracket tags
  const bracketRegex = /\[(?:image|audio|video):([^\]]+)\]/g;
  let match;
  while ((match = bracketRegex.exec(allText)) !== null) {
    filenames.push(match[1]);
  }

  return [...new Set(filenames)];
}

/**
 * Strip HTML formatting from field values, keeping only plain text and media refs.
 */
function convertFieldsToPlainText(
  fields: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = stripHtmlToPlainText(value);
  }
  return result;
}

export class ImportService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  private nextNumericId(userId: string): number {
    const result = this.db
      .select({ max: sql<number>`COALESCE(MAX(${decks.numericId}), 0)` })
      .from(decks)
      .where(eq(decks.userId, userId))
      .get();
    return (result?.max ?? 0) + 1;
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
          numericId: this.nextNumericId(userId),
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
        numericId: this.nextNumericId(userId),
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

    // Create a basic card template in WYSIWYG format
    const templateId = generateId();
    const firstField = fieldNames[0];
    const remainingFields = fieldNames.slice(1);
    const answerHtml =
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
        answerTemplate: answerHtml,
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

  importFromCrowdAnki(
    userId: string,
    json: unknown,
    mediaMapping?: Map<string, string>,
  ): ImportResult {
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

      // Create templates — convert HTML to WYSIWYG JSON
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
      mediaMapping,
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
    mediaMapping?: Map<string, string>,
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
        numericId: this.nextNumericId(userId),
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
      const rawFields: Record<string, string> = {};
      for (const field of fieldDefs) {
        rawFields[field.name] = note.fields[field.ordinal] ?? "";
      }

      // Rewrite media URLs if mapping is provided
      if (mediaMapping) {
        for (const fieldName of Object.keys(rawFields)) {
          rawFields[fieldName] = rewriteMediaUrls(
            rawFields[fieldName],
            mediaMapping,
          );
        }
      }

      const noteFields = convertFieldsToPlainText(rawFields);

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

      // Track media references
      if (mediaMapping) {
        this.linkNoteMedia(noteId, noteFields);
      }

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
        mediaMapping,
      );
      deckCount += childResult.deckCount;
      noteCount += childResult.noteCount;
      cardCount += childResult.cardCount;
    }

    return { deckCount, noteCount, cardCount };
  }

  // oxlint-disable-next-line eslint(complexity) -- merge logic adds necessary branching
  importFromApkg(
    userId: string,
    data: ApkgData,
    mediaMapping?: Map<string, string>,
    merge?: boolean,
  ): ImportResult {
    const now = new Date();
    let noteCount = 0;
    let cardCount = 0;
    let duplicatesSkipped = 0;
    let notesUpdated = 0;

    // Collect which Anki deck IDs are actually referenced by cards
    const usedDeckIds = new Set(data.cards.map((c) => c.deckId));

    // Create or reuse decks, mapping anki deck id -> our deck id
    // Anki uses "::" as separator for nested decks (e.g. "Music::Theory::Chords")
    const hierarchyCache = new Map<string, string>();
    const deckMap = new Map<number, string>();
    for (const ankiDeck of data.decks) {
      if (!usedDeckIds.has(ankiDeck.id)) {
        continue;
      }
      const leafDeckId = this.resolveOrCreateDeckHierarchy(
        userId,
        ankiDeck.name,
        merge ?? false,
        now,
        hierarchyCache,
      );
      deckMap.set(ankiDeck.id, leafDeckId);
    }

    // Create or reuse note types, mapping anki model id -> our note type id
    const noteTypeMap = new Map<number, string>();
    const templateMap = new Map<string, string>();
    for (const ankiNoteType of data.noteTypes) {
      if (merge) {
        const existing = this.db
          .select()
          .from(noteTypes)
          .where(
            and(
              eq(noteTypes.userId, userId),
              eq(noteTypes.name, ankiNoteType.name),
            ),
          )
          .get();
        if (existing) {
          noteTypeMap.set(ankiNoteType.id, existing.id);
          // Load existing templates for this note type
          const existingTemplates = this.db
            .select()
            .from(cardTemplates)
            .where(eq(cardTemplates.noteTypeId, existing.id))
            .all();
          for (const tmpl of existingTemplates) {
            templateMap.set(`${existing.id}:${tmpl.ordinal}`, tmpl.id);
          }
          continue;
        }
      }

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

      // Create templates — convert HTML to WYSIWYG JSON
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
    const skippedNoteIds = new Set<number>();
    for (const ankiNote of data.notes) {
      const noteTypeId = noteTypeMap.get(ankiNote.modelId);
      if (!noteTypeId) {
        continue;
      }

      // Check for existing note by ankiGuid when merging
      if (merge && ankiNote.guid) {
        const existing = this.db
          .select()
          .from(notes)
          .where(
            and(eq(notes.userId, userId), eq(notes.ankiGuid, ankiNote.guid)),
          )
          .get();
        if (existing) {
          // Build the incoming field dict with media URLs rewritten and HTML stripped
          const ankiNoteType = data.noteTypes.find(
            (nt) => nt.id === ankiNote.modelId,
          );
          const incomingFields: Record<string, string> = {};
          if (ankiNoteType) {
            for (const field of ankiNoteType.fields) {
              incomingFields[field.name] = ankiNote.fields[field.ordinal] ?? "";
            }
          }
          if (mediaMapping) {
            for (const fieldName of Object.keys(incomingFields)) {
              incomingFields[fieldName] = rewriteMediaUrls(
                incomingFields[fieldName],
                mediaMapping,
              );
            }
          }
          // Strip HTML from fields — fields store plain text + media refs
          const plainFields = convertFieldsToPlainText(incomingFields);

          // Compare rewritten+stripped fields against stored fields
          if (fieldsEqual(existing.fields, plainFields)) {
            // Unchanged — skip
            skippedNoteIds.add(ankiNote.id);
            duplicatesSkipped += 1;
            continue;
          }

          // Changed — update existing note with plain text fields
          this.db
            .update(notes)
            .set({
              fields: plainFields,
              tags: ankiNote.tags.trim(),
              updatedAt: now,
            })
            .where(eq(notes.id, existing.id))
            .run();

          // Re-link media
          if (mediaMapping) {
            this.db
              .delete(noteMedia)
              .where(eq(noteMedia.noteId, existing.id))
              .run();
            this.linkNoteMedia(existing.id, plainFields);
          }

          // Map anki note ID to existing DB note ID (cards already exist)
          noteMap.set(ankiNote.id, existing.id);
          skippedNoteIds.add(ankiNote.id);
          notesUpdated += 1;
          continue;
        }
      }

      const noteId = generateId();
      noteMap.set(ankiNote.id, noteId);

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

      // Strip HTML from fields — fields store plain text + media refs
      const plainNoteFields = convertFieldsToPlainText(noteFields);

      this.db
        .insert(notes)
        .values({
          id: noteId,
          userId,
          noteTypeId,
          fields: plainNoteFields,
          tags: ankiNote.tags.trim(),
          ankiGuid: ankiNote.guid || undefined,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Track media references
      if (mediaMapping) {
        this.linkNoteMedia(noteId, plainNoteFields);
      }

      noteCount += 1;
    }

    // Create cards (skip cards for duplicate notes)
    for (const ankiCard of data.cards) {
      if (skippedNoteIds.has(ankiCard.noteId)) {
        continue;
      }

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
      deckCount: deckMap.size,
      noteCount,
      cardCount,
      duplicatesSkipped,
      notesUpdated,
    };
  }

  private resolveOrCreateDeckHierarchy(
    userId: string,
    fullName: string,
    merge: boolean,
    now: Date,
    hierarchyCache: Map<string, string>,
  ): string {
    // Anki uses "::" in older format and U+001F (unit separator) in newer format
    // oxlint-disable-next-line eslint(no-control-regex), unicorn(prefer-string-replace-all) -- intentionally matching Anki's U+001F separator
    const normalized = fullName.replace(/\u001F/g, "::");
    const segments = normalized
      .split("::")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (segments.length === 0) {
      segments.push(fullName);
    }

    let currentParentId: string | undefined;
    let pathKey = "";

    for (const segment of segments) {
      pathKey = pathKey ? `${pathKey}::${segment}` : segment;

      const cachedId = hierarchyCache.get(pathKey);
      if (cachedId) {
        currentParentId = cachedId;
        continue;
      }

      if (merge) {
        const existing = this.db
          .select()
          .from(decks)
          .where(
            and(
              eq(decks.userId, userId),
              eq(decks.name, segment),
              currentParentId
                ? eq(decks.parentId, currentParentId)
                : isNull(decks.parentId),
            ),
          )
          .get();
        if (existing) {
          hierarchyCache.set(pathKey, existing.id);
          currentParentId = existing.id;
          continue;
        }
      }

      const deckId = generateId();
      this.db
        .insert(decks)
        .values({
          id: deckId,
          userId,
          name: segment,
          parentId: currentParentId ?? null,
          numericId: this.nextNumericId(userId),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      hierarchyCache.set(pathKey, deckId);
      currentParentId = deckId;
    }

    return currentParentId!;
  }

  private linkNoteMedia(
    noteId: string,
    noteFields: Record<string, string>,
  ): void {
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
}
