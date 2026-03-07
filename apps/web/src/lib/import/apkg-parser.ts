import { unzipSync, strFromU8 } from "fflate";
import { Database } from "bun:sqlite";
import {
  writeFileSync as fsWriteFileSync,
  unlinkSync as fsUnlinkSync,
  existsSync as fsExistsSync,
} from "node:fs";
import { join as pathJoin } from "node:path";
import { tmpdir as osTmpdir } from "node:os";

const writeFileSync = fsWriteFileSync as (
  path: string,
  data: Uint8Array,
) => void;
const unlinkSync = fsUnlinkSync as (path: string) => void;
const existsSync = fsExistsSync as (path: string) => boolean;
const join = pathJoin as (...paths: string[]) => string;
const tmpdir = osTmpdir as () => string;

export type ApkgNoteType = {
  id: number;
  name: string;
  fields: Array<{ name: string; ordinal: number }>;
  templates: Array<{
    name: string;
    questionFormat: string;
    answerFormat: string;
    ordinal: number;
  }>;
  css: string;
};

export type ApkgDeck = {
  id: number;
  name: string;
};

export type ApkgNote = {
  id: number;
  modelId: number;
  fields: string[];
  tags: string;
};

export type ApkgCard = {
  id: number;
  noteId: number;
  deckId: number;
  ordinal: number;
  type: number;
  queue: number;
  due: number;
  interval: number;
  factor: number;
  reps: number;
  lapses: number;
};

export type ApkgMediaEntry = {
  filename: string;
  index: string;
  data: Uint8Array;
};

export type ApkgData = {
  decks: ApkgDeck[];
  noteTypes: ApkgNoteType[];
  notes: ApkgNote[];
  cards: ApkgCard[];
  media: ApkgMediaEntry[];
};

type ColRow = { decks: string; models: string };
type NoteRow = { id: number; mid: number; flds: string; tags: string };
type CardRow = {
  id: number;
  nid: number;
  did: number;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
};

/** Minimal typed wrapper for bun:sqlite query operations */
type SqliteQuery<T> = {
  get(): T | undefined;
  all(): T[];
};

type TypedDatabase = {
  query<T>(sql: string): SqliteQuery<T>;
  close(): void;
};

export function parseApkg(buffer: ArrayBuffer): ApkgData {
  const uint8 = new Uint8Array(buffer);
  const unzipped = unzipSync(uint8);

  // Find the SQLite database file
  const dbFilename = findDbFile(unzipped);
  if (!dbFilename) {
    throw new Error(
      "No collection database found in .apkg file (expected collection.anki21 or collection.anki2)",
    );
  }

  const dbBytes = unzipped[dbFilename];

  // Write to temp file since bun:sqlite needs a file path
  const tempPath = join(
    tmpdir(),
    `swanki-import-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );

  try {
    writeFileSync(tempPath, dbBytes);
    const db = new (Database as unknown as new (
      path: string,
      opts: { readonly: boolean },
    ) => TypedDatabase)(tempPath, { readonly: true });

    try {
      const deckData = readDecks(db);
      const noteTypeData = readNoteTypes(db);
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
  } finally {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

function findDbFile(files: Record<string, Uint8Array>): string | undefined {
  if ("collection.anki21" in files) {
    return "collection.anki21";
  }
  if ("collection.anki2" in files) {
    return "collection.anki2";
  }
  return undefined;
}

function readDecks(db: TypedDatabase): ApkgDeck[] {
  const row = db.query<ColRow>("SELECT decks FROM col").get();
  if (!row) {
    return [];
  }

  const decksJson = JSON.parse(row.decks) as Record<
    string,
    { id: number; name: string }
  >;

  return Object.values(decksJson).map((d) => ({
    id: d.id,
    name: d.name,
  }));
}

function readNoteTypes(db: TypedDatabase): ApkgNoteType[] {
  const row = db.query<ColRow>("SELECT models FROM col").get();
  if (!row) {
    return [];
  }

  const modelsJson = JSON.parse(row.models) as Record<
    string,
    {
      id: number;
      name: string;
      flds: Array<{ name: string; ord: number }>;
      tmpls: Array<{
        name: string;
        qfmt: string;
        afmt: string;
        ord: number;
      }>;
      css?: string;
    }
  >;

  return Object.values(modelsJson).map((model) => ({
    id: model.id,
    name: model.name,
    fields: model.flds.map((f) => ({
      name: f.name,
      ordinal: f.ord,
    })),
    templates: model.tmpls.map((t) => ({
      name: t.name,
      questionFormat: t.qfmt,
      answerFormat: t.afmt,
      ordinal: t.ord,
    })),
    css: model.css ?? "",
  }));
}

function readNotes(db: TypedDatabase): ApkgNote[] {
  const rows = db.query<NoteRow>("SELECT id, mid, flds, tags FROM notes").all();

  return rows.map((row) => ({
    id: row.id,
    modelId: row.mid,
    fields: row.flds.split("\u001F"),
    tags: row.tags,
  }));
}

function readCards(db: TypedDatabase): ApkgCard[] {
  const rows = db
    .query<CardRow>(
      "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards",
    )
    .all();

  return rows.map((row) => ({
    id: row.id,
    noteId: row.nid,
    deckId: row.did,
    ordinal: row.ord,
    type: row.type,
    queue: row.queue,
    due: row.due,
    interval: row.ivl,
    factor: row.factor,
    reps: row.reps,
    lapses: row.lapses,
  }));
}

function readMedia(files: Record<string, Uint8Array>): ApkgMediaEntry[] {
  const mediaFile = files.media;
  if (!mediaFile) {
    return [];
  }

  const mediaMapStr = strFromU8(mediaFile);
  const mediaMap = JSON.parse(mediaMapStr) as Record<string, string>;

  const entries: ApkgMediaEntry[] = [];
  for (const [index, filename] of Object.entries(mediaMap)) {
    const data = files[index];
    if (data) {
      entries.push({ filename, index, data });
    }
  }

  return entries;
}
