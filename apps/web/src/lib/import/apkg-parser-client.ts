/**
 * Client-side APKG parser using sql.js (SQLite compiled to WASM).
 * Runs entirely in the browser — no file upload needed for preview.
 */
import { unzipSync } from "fflate";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import {
  findDbFile,
  prepareDbBytes,
  readMedia,
  mapNoteRows,
  mapCardRows,
  parseDecksFromJson,
  parseNoteTypesFromJson,
  parseTemplateConfig,
  parseNoteTypeConfig,
} from "./apkg-parser-core";

import type {
  ApkgData,
  ApkgNoteType,
  ApkgMediaEntry,
  NoteRow,
  CardRow,
} from "./apkg-parser-core";

export type { ApkgNoteType, ApkgData, ApkgMediaEntry };

export type ApkgPreviewData = {
  decks: Array<{ name: string }>;
  noteTypes: Array<{
    name: string;
    fields: Array<{ name: string; ordinal: number }>;
    templates: Array<{
      name: string;
      questionFormat: string;
      answerFormat: string;
      ordinal: number;
    }>;
    css: string;
  }>;
  sampleNotes: Array<{
    noteTypeName: string;
    fields: Record<string, string>;
  }>;
  totalCards: number;
  totalNotes: number;
  totalMedia: number;
  mergeStats?: {
    newNotes: number;
    updatedNotes: number;
    unchangedNotes: number;
  };
};

let sqlJsPromise: ReturnType<typeof initSqlJs> | undefined;

function getSqlJs(): ReturnType<typeof initSqlJs> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file: string) => `/${file}`,
    });
  }
  return sqlJsPromise;
}

/** Parse an APKG/COLPKG file entirely in the browser */
export async function parseApkgClient(buffer: ArrayBuffer): Promise<ApkgData> {
  const SQL = await getSqlJs();
  const uint8 = new Uint8Array(buffer);
  const unzipped = unzipSync(uint8);

  const dbFilename = findDbFile(unzipped);
  if (!dbFilename) {
    throw new Error(
      "No collection database found in .apkg file (expected collection.anki21b, collection.anki21, or collection.anki2)",
    );
  }

  const dbBytes = prepareDbBytes(unzipped[dbFilename]);
  const db = new SQL.Database(dbBytes);

  try {
    const useNewSchema = isNewSchema(db);
    const deckData = useNewSchema ? readDecksNew(db) : readDecks(db);
    const noteTypeData = useNewSchema
      ? readNoteTypesNew(db)
      : readNoteTypes(db);
    const noteData = readNotes(db);
    const cardData = readCards(db);
    const mediaData = readMedia(unzipped);

    return {
      decks: deckData,
      noteTypes: noteTypeData,
      notes: noteData,
      cards: cardData,
      media: mediaData,
    };
  } finally {
    db.close();
  }
}

const MAX_NOTES_PER_TYPE = 5;
const MAX_TOTAL_NOTES = 10;

/** Build a preview from an APKG file entirely client-side */
export async function buildClientPreview(
  buffer: ArrayBuffer,
): Promise<ApkgPreviewData> {
  const apkgData = await parseApkgClient(buffer);

  const notesByModel = new Map<number, (typeof apkgData.notes)[number][]>();
  for (const note of apkgData.notes) {
    const existing = notesByModel.get(note.modelId);
    if (existing) {
      existing.push(note);
    } else {
      notesByModel.set(note.modelId, [note]);
    }
  }

  const sampleNotes: ApkgPreviewData["sampleNotes"] = [];
  for (const nt of apkgData.noteTypes) {
    if (sampleNotes.length >= MAX_TOTAL_NOTES) {
      break;
    }
    const ntNotes = notesByModel.get(nt.id) ?? [];
    const limit = Math.min(
      MAX_NOTES_PER_TYPE,
      MAX_TOTAL_NOTES - sampleNotes.length,
    );
    for (let i = 0; i < Math.min(ntNotes.length, limit); i += 1) {
      const note = ntNotes[i];
      const fields: Record<string, string> = {};
      for (const field of nt.fields) {
        fields[field.name] = note.fields[field.ordinal] ?? "";
      }
      sampleNotes.push({ noteTypeName: nt.name, fields });
    }
  }

  return {
    decks: apkgData.decks.map((d) => ({ name: d.name })),
    noteTypes: apkgData.noteTypes.map((nt) => ({
      name: nt.name,
      fields: nt.fields,
      templates: nt.templates,
      css: nt.css,
    })),
    sampleNotes,
    totalCards: apkgData.cards.length,
    totalNotes: apkgData.notes.length,
    totalMedia: apkgData.media.length,
  };
}

// --- sql.js query helpers ---

function queryAll<T>(db: SqlJsDatabase, sql: string): T[] {
  const stmt = db.prepare(sql);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

function queryFirst<T>(db: SqlJsDatabase, sql: string): T | undefined {
  const stmt = db.prepare(sql);
  let result: T | undefined;
  if (stmt.step()) {
    result = stmt.getAsObject() as T;
  }
  stmt.free();
  return result;
}

function isNewSchema(db: SqlJsDatabase): boolean {
  try {
    db.exec("SELECT count(*) as cnt FROM notetypes");
    return true;
  } catch {
    return false;
  }
}

function hasColumn(db: SqlJsDatabase, table: string, column: string): boolean {
  try {
    db.exec(`SELECT ${column} FROM ${table} LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

function readDecks(db: SqlJsDatabase): ApkgData["decks"] {
  const row = queryFirst<{ decks: string }>(db, "SELECT decks FROM col");
  if (!row) {
    return [];
  }
  return parseDecksFromJson(row.decks);
}

function readNoteTypes(db: SqlJsDatabase): ApkgNoteType[] {
  const row = queryFirst<{ models: string }>(db, "SELECT models FROM col");
  if (!row) {
    return [];
  }
  return parseNoteTypesFromJson(row.models);
}

function readDecksNew(db: SqlJsDatabase): ApkgData["decks"] {
  return queryAll<{ id: number; name: string }>(
    db,
    "SELECT id, name FROM decks",
  ).map((d) => ({ id: d.id, name: d.name }));
}

type NewFieldRow = { ntid: number; ord: number; name: string };

function readNoteTypesNew(db: SqlJsDatabase): ApkgNoteType[] {
  const fieldRows = queryAll<NewFieldRow>(
    db,
    "SELECT ntid, ord, name FROM fields ORDER BY ord",
  );

  const hasConfigBlob = hasColumn(db, "notetypes", "config");

  if (hasConfigBlob) {
    return readNoteTypesNewProtobuf(db, fieldRows);
  }
  return readNoteTypesNewPlainColumns(db, fieldRows);
}

function readNoteTypesNewProtobuf(
  db: SqlJsDatabase,
  fieldRows: NewFieldRow[],
): ApkgNoteType[] {
  type NtRow = { id: number; name: string; config: Uint8Array | undefined };
  type TmplRow = {
    ntid: number;
    ord: number;
    name: string;
    config: Uint8Array | undefined;
  };

  const noteTypeRows = queryAll<NtRow>(
    db,
    "SELECT id, name, config FROM notetypes",
  );
  const templateRows = queryAll<TmplRow>(
    db,
    "SELECT ntid, ord, name, config FROM templates ORDER BY ord",
  );

  return noteTypeRows.map((nt) => ({
    id: nt.id,
    name: nt.name,
    fields: fieldRows
      .filter((f) => f.ntid === nt.id)
      .map((f) => ({ name: f.name, ordinal: f.ord })),
    templates: templateRows
      .filter((t) => t.ntid === nt.id)
      .map((t) => {
        const tmplConfig = parseTemplateConfig(
          t.config ? new Uint8Array(t.config) : undefined,
        );
        return {
          name: t.name,
          questionFormat: tmplConfig.qfmt,
          answerFormat: tmplConfig.afmt,
          ordinal: t.ord,
        };
      }),
    css: parseNoteTypeConfig(nt.config ? new Uint8Array(nt.config) : undefined)
      .css,
  }));
}

function readNoteTypesNewPlainColumns(
  db: SqlJsDatabase,
  fieldRows: NewFieldRow[],
): ApkgNoteType[] {
  type NtRow = { id: number; name: string; css: string };
  type TmplRow = {
    ntid: number;
    ord: number;
    name: string;
    qfmt: string;
    afmt: string;
  };

  let noteTypeRows: NtRow[];
  try {
    noteTypeRows = queryAll<NtRow>(
      db,
      "SELECT id, name, COALESCE(css, '') as css FROM notetypes",
    );
  } catch {
    noteTypeRows = queryAll<{ id: number; name: string }>(
      db,
      "SELECT id, name FROM notetypes",
    ).map((r) => ({ id: r.id, name: r.name, css: "" }));
  }

  const templateRows = queryAll<TmplRow>(
    db,
    "SELECT ntid, ord, name, qfmt, afmt FROM templates ORDER BY ord",
  );

  return noteTypeRows.map((nt) => ({
    id: nt.id,
    name: nt.name,
    fields: fieldRows
      .filter((f) => f.ntid === nt.id)
      .map((f) => ({ name: f.name, ordinal: f.ord })),
    templates: templateRows
      .filter((t) => t.ntid === nt.id)
      .map((t) => ({
        name: t.name,
        questionFormat: t.qfmt,
        answerFormat: t.afmt,
        ordinal: t.ord,
      })),
    css: nt.css,
  }));
}

function readNotes(db: SqlJsDatabase): ApkgData["notes"] {
  const rows = queryAll<NoteRow>(
    db,
    "SELECT id, guid, mid, flds, tags FROM notes",
  );
  return mapNoteRows(rows);
}

function readCards(db: SqlJsDatabase): ApkgData["cards"] {
  const rows = queryAll<CardRow>(
    db,
    "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards",
  );
  return mapCardRows(rows);
}
