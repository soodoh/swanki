import { unzipSync } from "fflate";
import { Database } from "bun:sqlite";
import {
  writeFileSync as fsWriteFileSync,
  unlinkSync as fsUnlinkSync,
  existsSync as fsExistsSync,
} from "node:fs";
import { join as pathJoin } from "node:path";
import { tmpdir as osTmpdir } from "node:os";

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
  ColRow,
  NoteRow,
  CardRow,
} from "./apkg-parser-core";

// Re-export types so existing imports from this module still work
export type {
  ApkgNoteType,
  ApkgDeck,
  ApkgNote,
  ApkgCard,
  ApkgMediaEntry,
  ApkgData,
} from "./apkg-parser-core";

const writeFileSync = fsWriteFileSync as (
  path: string,
  data: Uint8Array,
) => void;
const unlinkSync = fsUnlinkSync as (path: string) => void;
const existsSync = fsExistsSync as (path: string) => boolean;
const join = pathJoin as (...paths: string[]) => string;
const tmpdir = osTmpdir as () => string;

/** Minimal typed wrapper for bun:sqlite query operations */
type SqliteQuery<T> = {
  get(): T | undefined;
  all(): T[];
};

type TypedDatabase = {
  query<T>(sql: string): SqliteQuery<T>;
  run(sql: string): void;
  close(): void;
};

export type ParseApkgOptions = {
  /** When true, skip reading media binary data (useful for preview). */
  skipMedia?: boolean;
};

export function parseApkg(
  buffer: ArrayBuffer,
  options?: ParseApkgOptions,
): ApkgData {
  const uint8 = new Uint8Array(buffer);
  const unzipped = options?.skipMedia
    ? unzipSync(uint8, {
        filter: (file) =>
          file.name === "media" || file.name.startsWith("collection."),
      })
    : unzipSync(uint8);

  const dbFilename = findDbFile(unzipped);
  if (!dbFilename) {
    throw new Error(
      "No collection database found in .apkg file (expected collection.anki21b, collection.anki21, or collection.anki2)",
    );
  }

  const dbBytes = prepareDbBytes(unzipped[dbFilename]);

  // Write to temp file since bun:sqlite needs a file path
  const tempPath = join(
    tmpdir(),
    `swanki-import-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );

  try {
    writeFileSync(tempPath, dbBytes);
    const db = new (Database as unknown as new (path: string) => TypedDatabase)(
      tempPath,
    );

    try {
      db.run("PRAGMA journal_mode = DELETE");

      const useNewSchema = isNewSchema(db);
      const deckData = useNewSchema ? readDecksNew(db) : readDecks(db);
      const noteTypeData = useNewSchema
        ? readNoteTypesNew(db)
        : readNoteTypes(db);
      const noteData = readNotes(db);
      const cardData = readCards(db);
      const mediaData = options?.skipMedia ? [] : readMedia(unzipped);

      return {
        decks: deckData,
        noteTypes: noteTypeData,
        notes: noteData,
        cards: cardData,
        media: mediaData,
        _unzipped: options?.skipMedia ? unzipped : undefined,
      };
    } finally {
      db.close();
    }
  } finally {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
      const walPath = `${tempPath}-wal`;
      const shmPath = `${tempPath}-shm`;
      if (existsSync(walPath)) {
        unlinkSync(walPath);
      }
      if (existsSync(shmPath)) {
        unlinkSync(shmPath);
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

function isNewSchema(db: TypedDatabase): boolean {
  try {
    db.query<{ cnt: number }>("SELECT count(*) as cnt FROM notetypes").get();
    return true;
  } catch {
    return false;
  }
}

function readDecks(db: TypedDatabase): ApkgData["decks"] {
  const row = db.query<ColRow>("SELECT decks FROM col").get();
  if (!row) {
    return [];
  }
  return parseDecksFromJson(row.decks);
}

function readNoteTypes(db: TypedDatabase): ApkgNoteType[] {
  const row = db.query<ColRow>("SELECT models FROM col").get();
  if (!row) {
    return [];
  }
  return parseNoteTypesFromJson(row.models);
}

// --- New schema readers (Anki 2.1.50+) ---

type NewDeckRow = { id: number; name: string };
type NewFieldRow = { ntid: number; ord: number; name: string };

function hasColumn(db: TypedDatabase, table: string, column: string): boolean {
  try {
    db.query(`SELECT ${column} FROM ${table} LIMIT 0`).all();
    return true;
  } catch {
    return false;
  }
}

function readDecksNew(db: TypedDatabase): ApkgData["decks"] {
  const rows = db.query<NewDeckRow>("SELECT id, name FROM decks").all();
  return rows.map((d) => ({ id: d.id, name: d.name }));
}

function readNoteTypesNew(db: TypedDatabase): ApkgNoteType[] {
  const fieldRows = db
    .query<NewFieldRow>("SELECT ntid, ord, name FROM fields ORDER BY ord")
    .all();

  const hasConfigBlob = hasColumn(db, "notetypes", "config");

  if (hasConfigBlob) {
    return readNoteTypesNewProtobuf(db, fieldRows);
  }
  return readNoteTypesNewPlainColumns(db, fieldRows);
}

function readNoteTypesNewProtobuf(
  db: TypedDatabase,
  fieldRows: NewFieldRow[],
): ApkgNoteType[] {
  type NtRow = { id: number; name: string; config: Uint8Array | undefined };
  type TmplRow = {
    ntid: number;
    ord: number;
    name: string;
    config: Uint8Array | undefined;
  };

  const noteTypeRows = db
    .query<NtRow>("SELECT id, name, config FROM notetypes")
    .all();
  const templateRows = db
    .query<TmplRow>(
      "SELECT ntid, ord, name, config FROM templates ORDER BY ord",
    )
    .all();

  return noteTypeRows.map((nt) => ({
    id: nt.id,
    name: nt.name,
    fields: fieldRows
      .filter((f) => f.ntid === nt.id)
      .map((f) => ({ name: f.name, ordinal: f.ord })),
    templates: templateRows
      .filter((t) => t.ntid === nt.id)
      .map((t) => {
        const tmplConfig = parseTemplateConfig(t.config);
        return {
          name: t.name,
          questionFormat: tmplConfig.qfmt,
          answerFormat: tmplConfig.afmt,
          ordinal: t.ord,
        };
      }),
    css: parseNoteTypeConfig(nt.config).css,
  }));
}

function readNoteTypesNewPlainColumns(
  db: TypedDatabase,
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
    noteTypeRows = db
      .query<NtRow>("SELECT id, name, COALESCE(css, '') as css FROM notetypes")
      .all();
  } catch {
    noteTypeRows = db
      .query<{ id: number; name: string }>("SELECT id, name FROM notetypes")
      .all()
      .map((r) => ({ id: r.id, name: r.name, css: "" }));
  }

  const templateRows = db
    .query<TmplRow>(
      "SELECT ntid, ord, name, qfmt, afmt FROM templates ORDER BY ord",
    )
    .all();

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

function readNotes(db: TypedDatabase): ApkgData["notes"] {
  const rows = db
    .query<NoteRow>("SELECT id, guid, mid, flds, tags FROM notes")
    .all();
  return mapNoteRows(rows);
}

function readCards(db: TypedDatabase): ApkgData["cards"] {
  const rows = db
    .query<CardRow>(
      "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards",
    )
    .all();
  return mapCardRows(rows);
}
