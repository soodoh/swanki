import { unzipSync, strFromU8 } from "fflate";
import { decompress as zstdDecompress } from "fzstd";
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
  guid: string;
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
type NoteRow = {
  id: number;
  guid: string;
  mid: number;
  flds: string;
  tags: string;
};
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
  run(sql: string): void;
  close(): void;
};

// prettier-ignore
const ZSTD_MAGIC = [0x28, 0xB5, 0x2F, 0xFD];

function isZstdCompressed(data: Uint8Array): boolean {
  if (data.length < 4) {
    return false;
  }
  return (
    data[0] === ZSTD_MAGIC[0] &&
    data[1] === ZSTD_MAGIC[1] &&
    data[2] === ZSTD_MAGIC[2] &&
    data[3] === ZSTD_MAGIC[3]
  );
}

/**
 * Replace "unicase" collation with "nocase " in raw SQLite bytes.
 * Both are exactly 7 bytes, so the replacement is length-preserving
 * and won't corrupt the SQLite page structure.
 */
function patchUnicaseCollation(data: Uint8Array): Uint8Array {
  // "unicase" = [117, 110, 105, 99, 97, 115, 101]
  // "nocase " = [110, 111, 99, 97, 115, 101, 32]
  const target = new Uint8Array([117, 110, 105, 99, 97, 115, 101]);
  const replacement = new Uint8Array([110, 111, 99, 97, 115, 101, 32]);
  const patched = new Uint8Array(data);
  for (let i = 0; i <= patched.length - 7; i += 1) {
    if (
      patched[i] === target[0] &&
      patched[i + 1] === target[1] &&
      patched[i + 2] === target[2] &&
      patched[i + 3] === target[3] &&
      patched[i + 4] === target[4] &&
      patched[i + 5] === target[5] &&
      patched[i + 6] === target[6]
    ) {
      for (let j = 0; j < 7; j += 1) {
        patched[i + j] = replacement[j];
      }
    }
  }
  return patched;
}

export function parseApkg(buffer: ArrayBuffer): ApkgData {
  const uint8 = new Uint8Array(buffer);
  const unzipped = unzipSync(uint8);

  // Find the SQLite database file
  const dbFilename = findDbFile(unzipped);
  if (!dbFilename) {
    throw new Error(
      "No collection database found in .apkg file (expected collection.anki21b, collection.anki21, or collection.anki2)",
    );
  }

  let dbBytes = unzipped[dbFilename];

  // Anki 2.1.50+ .anki21b files are zstd-compressed
  if (isZstdCompressed(dbBytes)) {
    dbBytes = zstdDecompress(dbBytes);
  }

  // Patch "unicase" collation to "nocase " (Anki 2.1.50+ custom collation)
  dbBytes = patchUnicaseCollation(dbBytes);

  // Write to temp file since bun:sqlite needs a file path
  const tempPath = join(
    tmpdir(),
    `swanki-import-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );

  try {
    writeFileSync(tempPath, dbBytes);
    // Open writable — WAL-mode databases (from zstd-compressed files) can't be opened readonly
    const db = new (Database as unknown as new (path: string) => TypedDatabase)(
      tempPath,
    );

    try {
      // Convert from WAL to DELETE journal mode so we can work with it
      db.run("PRAGMA journal_mode = DELETE");

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
  } finally {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
      // Also clean up WAL/SHM files
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

function findDbFile(files: Record<string, Uint8Array>): string | undefined {
  // Prefer newer format first
  if ("collection.anki21b" in files) {
    return "collection.anki21b";
  }
  if ("collection.anki21" in files) {
    return "collection.anki21";
  }
  if ("collection.anki2" in files) {
    return "collection.anki2";
  }
  return undefined;
}

function isNewSchema(db: TypedDatabase): boolean {
  try {
    db.query<{ cnt: number }>("SELECT count(*) as cnt FROM notetypes").get();
    return true;
  } catch {
    return false;
  }
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

// --- New schema readers (Anki 2.1.50+) ---

type NewDeckRow = { id: number; name: string };
type NewFieldRow = { ntid: number; ord: number; name: string };

/** Check if a table has a specific column */
function hasColumn(db: TypedDatabase, table: string, column: string): boolean {
  try {
    db.query(`SELECT ${column} FROM ${table} LIMIT 0`).all();
    return true;
  } catch {
    return false;
  }
}

function readDecksNew(db: TypedDatabase): ApkgDeck[] {
  const rows = db.query<NewDeckRow>("SELECT id, name FROM decks").all();
  return rows.map((d) => ({ id: d.id, name: d.name }));
}

function readNoteTypesNew(db: TypedDatabase): ApkgNoteType[] {
  const fieldRows = db
    .query<NewFieldRow>("SELECT ntid, ord, name FROM fields ORDER BY ord")
    .all();

  // Detect whether we have protobuf config blobs or plain text columns
  const hasConfigBlob = hasColumn(db, "notetypes", "config");

  if (hasConfigBlob) {
    return readNoteTypesNewProtobuf(db, fieldRows);
  }
  return readNoteTypesNewPlainColumns(db, fieldRows);
}

/** Read note types from databases with protobuf config blobs (Anki 2.1.50+) */
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

/** Read note types from databases with plain text columns (css, qfmt, afmt) */
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

/** Read a varint from a protobuf buffer, returns [value, bytesConsumed] */
function readVarint(data: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 1;
  let pos = offset;
  let byte = data[pos];
  pos += 1;
  while (byte >= 128) {
    result += (byte - 128) * shift;
    shift *= 128;
    byte = data[pos];
    pos += 1;
  }
  result += byte * shift;
  return [result, pos - offset];
}

/** Read a length-delimited protobuf string field */
function readProtobufString(
  data: Uint8Array,
  offset: number,
  length: number,
): string {
  const bytes = data.slice(offset, offset + length);
  return new TextDecoder().decode(bytes);
}

/** Parse qfmt (field 1) and afmt (field 2) from a template's protobuf config blob */
function parseTemplateConfig(config: Uint8Array | undefined): {
  qfmt: string;
  afmt: string;
} {
  if (!config || config.length === 0) {
    return { qfmt: "", afmt: "" };
  }

  const data = config instanceof Uint8Array ? config : new Uint8Array(config);
  let qfmt = "";
  let afmt = "";
  let pos = 0;

  while (pos < data.length) {
    const [tagAndType, tagBytes] = readVarint(data, pos);
    pos += tagBytes;
    // Wire type is low 3 bits, field number is the rest
    const wireType = tagAndType % 8;
    const fieldNum = Math.floor(tagAndType / 8);

    if (wireType === 2) {
      // Length-delimited
      const [len, lenBytes] = readVarint(data, pos);
      pos += lenBytes;
      if (fieldNum === 1) {
        qfmt = readProtobufString(data, pos, len);
      } else if (fieldNum === 2) {
        afmt = readProtobufString(data, pos, len);
      }
      pos += len;
    } else if (wireType === 0) {
      // Varint — skip
      const [, vBytes] = readVarint(data, pos);
      pos += vBytes;
    } else if (wireType === 1) {
      // 64-bit — skip
      pos += 8;
    } else if (wireType === 5) {
      // 32-bit — skip
      pos += 4;
    } else {
      break;
    }
  }

  return { qfmt, afmt };
}

/** Parse CSS (field 3) from a notetype's protobuf config blob */
function parseNoteTypeConfig(config: Uint8Array | undefined): { css: string } {
  if (!config || config.length === 0) {
    return { css: "" };
  }

  const data = config instanceof Uint8Array ? config : new Uint8Array(config);
  let css = "";
  let pos = 0;

  while (pos < data.length) {
    const [tagAndType, tagBytes] = readVarint(data, pos);
    pos += tagBytes;
    const wireType = tagAndType % 8;
    const fieldNum = Math.floor(tagAndType / 8);

    if (wireType === 2) {
      const [len, lenBytes] = readVarint(data, pos);
      pos += lenBytes;
      if (fieldNum === 3) {
        css = readProtobufString(data, pos, len);
      }
      pos += len;
    } else if (wireType === 0) {
      const [, vBytes] = readVarint(data, pos);
      pos += vBytes;
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      break;
    }
  }

  return { css };
}

function readNotes(db: TypedDatabase): ApkgNote[] {
  const rows = db
    .query<NoteRow>("SELECT id, guid, mid, flds, tags FROM notes")
    .all();

  return rows.map((row) => ({
    id: row.id,
    guid: row.guid,
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

  const mediaMap = parseMediaMap(mediaFile);

  const entries: ApkgMediaEntry[] = [];
  for (const [index, filename] of Object.entries(mediaMap)) {
    let data = files[index];
    if (data) {
      // Anki 2.1.50+ may zstd-compress individual media files
      if (isZstdCompressed(data)) {
        data = zstdDecompress(data);
      }
      entries.push({ filename, index, data });
    }
  }

  return entries;
}

/**
 * Parse the media map file. In older Anki it's JSON, in newer Anki 2.1.50+
 * it may be zstd-compressed protobuf.
 */
function parseMediaMap(data: Uint8Array): Record<string, string> {
  let raw = data;

  // Decompress if zstd-compressed
  if (isZstdCompressed(raw)) {
    raw = zstdDecompress(raw);
  }

  // Try JSON first
  try {
    const str = strFromU8(raw);
    return JSON.parse(str) as Record<string, string>;
  } catch {
    // Fall back to protobuf parsing
    return parseMediaMapProtobuf(raw);
  }
}

/**
 * Parse protobuf-encoded media map.
 * The protobuf schema has repeated MediaEntry messages (field 1),
 * each containing: field 1 = name (string), field 2 = usn (uint32), field 3 = sha256 (bytes).
 * The zip index is determined by the entry's position in the repeated field (0-indexed).
 */
function parseMediaMapProtobuf(data: Uint8Array): Record<string, string> {
  const result: Record<string, string> = {};
  let pos = 0;
  let entryIndex = 0;

  while (pos < data.length) {
    const [tagAndType, tagBytes] = readVarint(data, pos);
    pos += tagBytes;
    const wireType = tagAndType % 8;
    const fieldNum = Math.floor(tagAndType / 8);

    if (wireType === 2) {
      const [len, lenBytes] = readVarint(data, pos);
      pos += lenBytes;

      if (fieldNum === 1) {
        // Embedded MediaEntry message
        const entryData = data.slice(pos, pos + len);
        const filename = parseMediaEntryName(entryData);
        if (filename) {
          result[String(entryIndex)] = filename;
        }
        entryIndex += 1;
      }

      pos += len;
    } else if (wireType === 0) {
      const [, vBytes] = readVarint(data, pos);
      pos += vBytes;
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      break;
    }
  }

  return result;
}

/** Extract the filename (field 1, string) from a MediaEntry protobuf message */
function parseMediaEntryName(data: Uint8Array): string | undefined {
  let pos = 0;

  while (pos < data.length) {
    const [tagAndType, tagBytes] = readVarint(data, pos);
    pos += tagBytes;
    const wireType = tagAndType % 8;
    const fieldNum = Math.floor(tagAndType / 8);

    if (wireType === 2) {
      const [len, lenBytes] = readVarint(data, pos);
      pos += lenBytes;
      if (fieldNum === 1) {
        return readProtobufString(data, pos, len);
      }
      pos += len;
    } else if (wireType === 0) {
      const [, vBytes] = readVarint(data, pos);
      pos += vBytes;
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      break;
    }
  }

  return undefined;
}
