import { eq, and, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
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
import { rawSqlite } from "../../db";
import { parseCrowdAnki } from "../import/crowdanki-parser";
import type { CrowdAnkiData } from "../import/crowdanki-parser";
import type { ApkgData } from "../import/apkg-parser";
import { stripHtmlToPlainText } from "../field-converter";

export type ImportProgressCallback = (
  phase: string,
  progress: number,
  detail: string,
) => void;

type Db = BunSQLiteDatabase<typeof schema>;

export type ImportFormat = "apkg" | "colpkg" | "csv" | "txt" | "crowdanki";

export type CsvImportOptions = {
  headers?: string[];
  rows: string[][];
  deckName?: string;
};

export type ImportResult = {
  deckId?: number;
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

/**
 * Strip Anki addon markup (script tags, link tags, and surrounding HTML comments)
 * from imported templates. These are injected by addons like Code Highlighter and
 * serve no purpose outside Anki desktop.
 */
/**
 * Strip CSS rules and directives that shouldn't be imported from Anki decks:
 * - `.card { ... }` rules with hardcoded colors that conflict with the app theme
 * - `@import` statements that reference external stylesheets
 */
function stripImportCss(css: string): string {
  return css
    .split(/\.card\s*\{[^}]*\}/g)
    .join("") // .card { ... } rules
    .split(/@import\b[^;]*;/g)
    .join("") // @import url(...); or @import "...";
    .trim();
}

export function stripAddonMarkup(html: string): string {
  const noComments = html.split(/<!--[\s\S]*?-->\s*/).join("");
  const noScripts = noComments
    .split(/<script\b[^>]*>[\s\S]*?<\/script>\s*/i)
    .join("");
  const noLinks = noScripts.split(/<link\b[^>]*\/?>\s*/i).join("");
  return noLinks.trim();
}

/** Global regex replace with a callback, typed to return `string` (avoids oxlint no-unsafe-* on replaceAll). */
function replaceGlobal(
  str: string,
  pattern: RegExp,
  replacer: (...args: string[]) => string,
): string {
  let result = "";
  let lastIndex = 0;
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let m = re.exec(str);
  while (m !== null) {
    result += str.slice(lastIndex, m.index);
    result += replacer(...m);
    lastIndex = re.lastIndex;
    m = re.exec(str);
  }
  result += str.slice(lastIndex);
  return result;
}

export function rewriteMediaUrls(
  text: string,
  mapping: Map<string, string>,
): string {
  // Rewrite <img src="filename"> → [image:hash.ext]
  // Supports double quotes, single quotes, and unquoted src values
  let result = replaceGlobal(
    text,
    /<img\s[^>]*src=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*\/?>/gi,
    (match, dq, sq, uq) => {
      const filename = dq ?? sq ?? uq;
      if (!filename) {
        return match;
      }
      const newFilename = mapping.get(filename);
      return newFilename ? `[image:${newFilename}]` : match;
    },
  );

  // Rewrite [sound:filename] → [audio:hash.ext]
  result = replaceGlobal(result, /\[sound:([^\]]+)\]/g, (match, filename) => {
    const newFilename = mapping.get(filename);
    return newFilename ? `[audio:${newFilename}]` : match;
  });

  // Rewrite <video src="filename"...>...</video> → [video:hash.ext]
  // Supports double quotes, single quotes, and unquoted src values
  result = replaceGlobal(
    result,
    /<video\s[^>]*src=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>[\s\S]*?<\/video>/gi,
    (match, dq, sq, uq) => {
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

  importFromCsv(userId: string, options: CsvImportOptions): ImportResult {
    const deckName = options.deckName ?? "CSV Import";
    const { rows } = options;

    if (rows.length === 0) {
      // Still create the deck, but no notes/cards
      const now = new Date();
      const deck = this.db
        .insert(decks)
        .values({
          userId,
          name: deckName,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      return { deckId: deck.id, noteCount: 0, cardCount: 0 };
    }

    // Determine field names
    const fieldCount = rows[0].length;
    const fieldNames =
      options.headers ??
      Array.from({ length: fieldCount }, (_, i) => `Field ${i + 1}`);

    // Create deck
    const now = new Date();
    const deck = this.db
      .insert(decks)
      .values({
        userId,
        name: deckName,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Create note type
    const fields = fieldNames.map((name, i) => ({ name, ordinal: i }));
    const noteType = this.db
      .insert(noteTypes)
      .values({
        userId,
        name: `${deckName} - Note Type`,
        fields,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Create a basic card template in WYSIWYG format
    const firstField = fieldNames[0];
    const remainingFields = fieldNames.slice(1);
    const answerHtml =
      remainingFields.length > 0
        ? remainingFields.map((f) => `{{${f}}}`).join("<br>")
        : `{{${firstField}}}`;

    const template = this.db
      .insert(cardTemplates)
      .values({
        noteTypeId: noteType.id,
        name: "Card 1",
        ordinal: 0,
        questionTemplate: `{{${firstField}}}`,
        answerTemplate: answerHtml,
      })
      .returning()
      .get();

    // Create notes and cards
    let noteCount = 0;
    let cardCount = 0;

    for (const row of rows) {
      const noteFields: Record<string, string> = {};
      for (let i = 0; i < fieldNames.length; i += 1) {
        noteFields[fieldNames[i]] = row[i] ?? "";
      }

      const note = this.db
        .insert(notes)
        .values({
          userId,
          noteTypeId: noteType.id,
          fields: noteFields,
          tags: "",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      noteCount += 1;

      this.db
        .insert(cards)
        .values({
          noteId: note.id,
          deckId: deck.id,
          templateId: template.id,
          ordinal: 0,
          state: 0,
          due: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      cardCount += 1;
    }

    return { deckId: deck.id, noteCount, cardCount };
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
    const modelMap = new Map<string, number>();

    // Create note types from all models in the data
    const now = new Date();
    for (const model of data.noteModels) {
      const fields = model.fields.map((f) => ({
        name: f.name,
        ordinal: f.ordinal,
      }));

      const noteType = this.db
        .insert(noteTypes)
        .values({
          userId,
          name: model.name,
          fields,
          css: stripImportCss(model.css),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      modelMap.set(model.uuid, noteType.id);

      // Create templates — convert HTML to WYSIWYG JSON
      for (const tmpl of model.templates) {
        this.db
          .insert(cardTemplates)
          .values({
            noteTypeId: noteType.id,
            name: tmpl.name,
            ordinal: tmpl.ordinal,
            questionTemplate: stripAddonMarkup(tmpl.questionFormat),
            answerTemplate: stripAddonMarkup(tmpl.answerFormat),
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
    modelMap: Map<string, number>,
    parentId: number | undefined,
    now: Date,
    mediaMapping?: Map<string, string>,
  ): { deckCount: number; noteCount: number; cardCount: number } {
    let deckCount = 0;
    let noteCount = 0;
    let cardCount = 0;

    // Create deck
    const deck = this.db
      .insert(decks)
      .values({
        userId,
        name: data.name,
        parentId: parentId ?? undefined,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    deckCount += 1;

    // Create notes for this deck
    for (const crowdAnkiNote of data.notes) {
      const noteTypeId = modelMap.get(crowdAnkiNote.noteModelUuid);
      if (!noteTypeId) {
        continue;
      }

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
        rawFields[field.name] = crowdAnkiNote.fields[field.ordinal] ?? "";
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

      // Skip notes with duplicate ankiGuid (unique constraint)
      if (crowdAnkiNote.guid) {
        const existing = this.db
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              eq(notes.userId, userId),
              eq(notes.ankiGuid, crowdAnkiNote.guid),
            ),
          )
          .get();
        if (existing) {
          continue;
        }
      }

      const note = this.db
        .insert(notes)
        .values({
          userId,
          noteTypeId,
          fields: noteFields,
          tags: crowdAnkiNote.tags.join(" "),
          ankiGuid: crowdAnkiNote.guid || undefined,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      noteCount += 1;

      // Track media references
      if (mediaMapping) {
        this.linkNoteMedia(note.id, noteFields);
      }

      // Get templates for this note type and create cards
      const templates = this.db
        .select()
        .from(cardTemplates)
        .where(eq(cardTemplates.noteTypeId, noteTypeId))
        .all();

      for (const tmpl of templates) {
        this.db
          .insert(cards)
          .values({
            noteId: note.id,
            deckId: deck.id,
            templateId: tmpl.id,
            ordinal: tmpl.ordinal,
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
        deck.id,
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
    const hierarchyCache = new Map<string, number>();
    const deckMap = new Map<number, number>();
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
    const noteTypeMap = new Map<number, number>();
    const templateMap = new Map<string, number>();
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

      const fields = ankiNoteType.fields.map((f) => ({
        name: f.name,
        ordinal: f.ordinal,
      }));

      const noteType = this.db
        .insert(noteTypes)
        .values({
          userId,
          name: ankiNoteType.name,
          fields,
          css: stripImportCss(ankiNoteType.css),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      noteTypeMap.set(ankiNoteType.id, noteType.id);

      // Create templates — convert HTML to WYSIWYG JSON
      for (const tmpl of ankiNoteType.templates) {
        const tmplRow = this.db
          .insert(cardTemplates)
          .values({
            noteTypeId: noteType.id,
            name: tmpl.name,
            ordinal: tmpl.ordinal,
            questionTemplate: stripAddonMarkup(tmpl.questionFormat),
            answerTemplate: stripAddonMarkup(tmpl.answerFormat),
          })
          .returning()
          .get();
        templateMap.set(`${noteType.id}:${tmpl.ordinal}`, tmplRow.id);
      }
    }

    // Create notes, mapping anki note id -> our note id
    const noteMap = new Map<number, number>();
    const skippedNoteIds = new Set<number>();
    for (const ankiNote of data.notes) {
      const noteTypeId = noteTypeMap.get(ankiNote.modelId);
      if (!noteTypeId) {
        continue;
      }

      // Check for existing note by ankiGuid (unique constraint prevents duplicates)
      if (ankiNote.guid) {
        const existing = this.db
          .select()
          .from(notes)
          .where(
            and(eq(notes.userId, userId), eq(notes.ankiGuid, ankiNote.guid)),
          )
          .get();
        if (existing) {
          if (!merge) {
            // Without merge, just skip existing notes (unique constraint prevents duplicates)
            skippedNoteIds.add(ankiNote.id);
            duplicatesSkipped += 1;
            continue;
          }

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

      const note = this.db
        .insert(notes)
        .values({
          userId,
          noteTypeId,
          fields: plainNoteFields,
          tags: ankiNote.tags.trim(),
          ankiGuid: ankiNote.guid || undefined,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      noteMap.set(ankiNote.id, note.id);

      // Track media references
      if (mediaMapping) {
        this.linkNoteMedia(note.id, plainNoteFields);
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
    hierarchyCache: Map<string, number>,
  ): number {
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

    let currentParentId: number | undefined;
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

      const deck = this.db
        .insert(decks)
        .values({
          userId,
          name: segment,
          parentId: currentParentId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      hierarchyCache.set(pathKey, deck.id);
      currentParentId = deck.id;
    }

    return currentParentId!;
  }

  private linkNoteMedia(
    noteId: number,
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
            noteId,
            mediaId: mediaRecord.id,
          })
          .onConflictDoNothing()
          .run();
      }
    }
  }

  // oxlint-disable-next-line eslint(complexity) -- batched import with merge logic requires high branching
  async importFromApkgBatched(
    userId: string,
    data: ApkgData,
    mediaMapping: Map<string, string> | undefined,
    merge: boolean,
    onProgress?: ImportProgressCallback,
  ): Promise<ImportResult> {
    const now = new Date();
    const BATCH_SIZE = 500;

    onProgress?.("notes", 0, "Creating decks and note types...");

    // === Create decks (same logic as importFromApkg) ===
    const usedDeckIds = new Set(data.cards.map((c) => c.deckId));
    const hierarchyCache = new Map<string, number>();
    const deckMap = new Map<number, number>();
    for (const ankiDeck of data.decks) {
      if (!usedDeckIds.has(ankiDeck.id)) {
        continue;
      }
      const leafDeckId = this.resolveOrCreateDeckHierarchy(
        userId,
        ankiDeck.name,
        merge,
        now,
        hierarchyCache,
      );
      deckMap.set(ankiDeck.id, leafDeckId);
    }

    // === Create note types ===
    const noteTypeMap = new Map<number, number>();
    const templateMap = new Map<string, number>();
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

      const fields = ankiNoteType.fields.map((f) => ({
        name: f.name,
        ordinal: f.ordinal,
      }));

      const noteType = this.db
        .insert(noteTypes)
        .values({
          userId,
          name: ankiNoteType.name,
          fields,
          css: stripImportCss(ankiNoteType.css),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      noteTypeMap.set(ankiNoteType.id, noteType.id);

      for (const tmpl of ankiNoteType.templates) {
        const tmplRow = this.db
          .insert(cardTemplates)
          .values({
            noteTypeId: noteType.id,
            name: tmpl.name,
            ordinal: tmpl.ordinal,
            questionTemplate: stripAddonMarkup(tmpl.questionFormat),
            answerTemplate: stripAddonMarkup(tmpl.answerFormat),
          })
          .returning()
          .get();
        templateMap.set(`${noteType.id}:${tmpl.ordinal}`, tmplRow.id);
      }
    }

    // === Bulk duplicate check (single SELECT instead of per-note) ===
    onProgress?.("notes", 2, "Checking for duplicates...");
    const existingByGuid = new Map<
      string,
      { id: number; fields: Record<string, string> }
    >();
    const allExisting = this.db
      .select({
        id: notes.id,
        ankiGuid: notes.ankiGuid,
        fields: notes.fields,
      })
      .from(notes)
      .where(eq(notes.userId, userId))
      .all();
    for (const n of allExisting) {
      if (n.ankiGuid) {
        existingByGuid.set(n.ankiGuid, { id: n.id, fields: n.fields });
      }
    }

    // === Build O(1) lookup maps ===
    const noteTypeById = new Map(data.noteTypes.map((nt) => [nt.id, nt]));
    const noteById = new Map(data.notes.map((n) => [n.id, n]));

    // === Classify notes into insert / update / skip ===
    type NoteInsertItem = {
      ankiId: number;
      values: typeof notes.$inferInsert;
      fields: Record<string, string>;
    };
    type NoteUpdateItem = {
      existingId: number;
      ankiId: number;
      fields: Record<string, string>;
      tags: string;
    };

    const toInsert: NoteInsertItem[] = [];
    const toUpdate: NoteUpdateItem[] = [];
    const skippedNoteIds = new Set<number>();
    const noteMap = new Map<number, number>();
    let duplicatesSkipped = 0;
    let notesUpdated = 0;

    for (const ankiNote of data.notes) {
      const noteTypeId = noteTypeMap.get(ankiNote.modelId);
      if (!noteTypeId) {
        continue;
      }

      const ankiNoteType = noteTypeById.get(ankiNote.modelId);
      const rawFields: Record<string, string> = {};
      if (ankiNoteType) {
        for (const field of ankiNoteType.fields) {
          rawFields[field.name] = ankiNote.fields[field.ordinal] ?? "";
        }
      }

      if (mediaMapping) {
        for (const fieldName of Object.keys(rawFields)) {
          rawFields[fieldName] = rewriteMediaUrls(
            rawFields[fieldName],
            mediaMapping,
          );
        }
      }

      const plainFields = convertFieldsToPlainText(rawFields);

      if (ankiNote.guid) {
        const existing = existingByGuid.get(ankiNote.guid);
        if (existing) {
          if (!merge) {
            skippedNoteIds.add(ankiNote.id);
            duplicatesSkipped += 1;
            continue;
          }

          if (fieldsEqual(existing.fields, plainFields)) {
            skippedNoteIds.add(ankiNote.id);
            duplicatesSkipped += 1;
            continue;
          }

          toUpdate.push({
            existingId: existing.id,
            ankiId: ankiNote.id,
            fields: plainFields,
            tags: ankiNote.tags.trim(),
          });
          noteMap.set(ankiNote.id, existing.id);
          skippedNoteIds.add(ankiNote.id);
          notesUpdated += 1;
          continue;
        }
      }

      toInsert.push({
        ankiId: ankiNote.id,
        values: {
          userId,
          noteTypeId,
          fields: plainFields,
          tags: ankiNote.tags.trim(),
          ankiGuid: ankiNote.guid || undefined,
          createdAt: now,
          updatedAt: now,
        },
        fields: plainFields,
      });
    }

    // === Pre-compute card insert values ===
    type CardInsertItem = {
      ankiNoteId: number;
      deckId: number;
      templateId: number;
      ordinal: number;
      state: number;
      reps: number;
      lapses: number;
    };
    const cardInserts: CardInsertItem[] = [];
    for (const ankiCard of data.cards) {
      if (skippedNoteIds.has(ankiCard.noteId)) {
        continue;
      }

      const deckId = deckMap.get(ankiCard.deckId);
      if (!deckId) {
        continue;
      }

      const ankiNote = noteById.get(ankiCard.noteId);
      if (!ankiNote) {
        continue;
      }

      const noteTypeId = noteTypeMap.get(ankiNote.modelId);
      if (!noteTypeId) {
        continue;
      }

      const templateId = templateMap.get(`${noteTypeId}:${ankiCard.ordinal}`);
      if (!templateId) {
        continue;
      }

      cardInserts.push({
        ankiNoteId: ankiCard.noteId,
        deckId,
        templateId,
        ordinal: ankiCard.ordinal,
        state: ankiCard.type,
        reps: ankiCard.reps,
        lapses: ankiCard.lapses,
      });
    }

    // === Transaction: batch insert/update ===
    onProgress?.(
      "notes",
      5,
      `Importing ${toInsert.length} notes and ${cardInserts.length} cards...`,
    );

    rawSqlite.exec("BEGIN TRANSACTION"); // SQLite exec, not child_process
    try {
      // Batch insert new notes
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        const inserted = this.db
          .insert(notes)
          .values(batch.map((item) => item.values))
          .returning()
          .all();

        for (let j = 0; j < inserted.length; j += 1) {
          noteMap.set(batch[j].ankiId, inserted[j].id);
        }

        const done = Math.min(i + BATCH_SIZE, toInsert.length);
        const pct = 5 + Math.round((done / toInsert.length) * 50);
        onProgress?.(
          "notes",
          pct,
          `Inserted ${done} / ${toInsert.length} notes`,
        );
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }

      // Batch update existing notes (merge mode)
      for (const upd of toUpdate) {
        this.db
          .update(notes)
          .set({ fields: upd.fields, tags: upd.tags, updatedAt: now })
          .where(eq(notes.id, upd.existingId))
          .run();
      }

      // Batch link media references
      if (mediaMapping) {
        const allMediaRecords = this.db.select().from(media).all();
        const mediaByFilename = new Map(
          allMediaRecords.map((m) => [m.filename, m.id]),
        );

        // Delete existing media links for updated notes
        for (const upd of toUpdate) {
          this.db
            .delete(noteMedia)
            .where(eq(noteMedia.noteId, upd.existingId))
            .run();
        }

        // Collect all media links
        const noteMediaValues: Array<{ noteId: number; mediaId: number }> = [];
        for (const item of toInsert) {
          const noteId = noteMap.get(item.ankiId);
          if (!noteId) {
            continue;
          }
          const filenames = extractMediaFilenames(item.fields);
          for (const filename of filenames) {
            const mediaId = mediaByFilename.get(filename);
            if (mediaId) {
              noteMediaValues.push({ noteId, mediaId });
            }
          }
        }
        for (const upd of toUpdate) {
          const filenames = extractMediaFilenames(upd.fields);
          for (const filename of filenames) {
            const mediaId = mediaByFilename.get(filename);
            if (mediaId) {
              noteMediaValues.push({ noteId: upd.existingId, mediaId });
            }
          }
        }

        // Batch insert noteMedia
        for (let i = 0; i < noteMediaValues.length; i += BATCH_SIZE) {
          const batch = noteMediaValues.slice(i, i + BATCH_SIZE);
          this.db.insert(noteMedia).values(batch).onConflictDoNothing().run();
        }
      }

      // Batch insert cards
      onProgress?.("cards", 0, `Creating ${cardInserts.length} cards...`);
      for (let i = 0; i < cardInserts.length; i += BATCH_SIZE) {
        const batch = cardInserts.slice(i, i + BATCH_SIZE);
        this.db
          .insert(cards)
          .values(
            batch.map((cv) => ({
              noteId: noteMap.get(cv.ankiNoteId)!,
              deckId: cv.deckId,
              templateId: cv.templateId,
              ordinal: cv.ordinal,
              state: cv.state,
              due: now,
              reps: cv.reps,
              lapses: cv.lapses,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .run();

        const done = Math.min(i + BATCH_SIZE, cardInserts.length);
        const pct = Math.round((done / cardInserts.length) * 100);
        onProgress?.(
          "cards",
          pct,
          `Created ${done} / ${cardInserts.length} cards`,
        );
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }

      rawSqlite.exec("COMMIT"); // SQLite exec, not child_process
    } catch (error) {
      rawSqlite.exec("ROLLBACK"); // SQLite exec, not child_process
      throw error;
    }

    onProgress?.("cleanup", 100, "Import complete!");

    return {
      deckCount: deckMap.size,
      noteCount: toInsert.length,
      cardCount: cardInserts.length,
      duplicatesSkipped,
      notesUpdated,
    };
  }
}
