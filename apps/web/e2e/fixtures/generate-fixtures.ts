/**
 * Bun script to generate APKG/COLPKG test fixtures for Playwright e2e tests.
 * Run: cd apps/web && bun run e2e/fixtures/generate-fixtures.ts
 */
import { Database } from "bun:sqlite";
import { zipSync, strToU8 } from "fflate";
import { join as joinPath } from "node:path";
import { tmpdir as getTmpdir } from "node:os";
import {
  readFileSync as readFileSyncRaw,
  unlinkSync as unlinkSyncRaw,
  existsSync as existsSyncRaw,
  writeFileSync as writeFileSyncRaw,
} from "node:fs";

// Typed wrappers — oxlint cannot resolve node: module types
const join = joinPath as (...paths: string[]) => string;
const tmpdir = getTmpdir as () => string;
const readFileSync = readFileSyncRaw as (path: string) => Uint8Array;
const existsSync = existsSyncRaw as (path: string) => boolean;
const unlinkSync = unlinkSyncRaw as (path: string) => void;
const writeFileSync = writeFileSyncRaw as (
  path: string,
  data: Uint8Array,
) => void;

/**
 * Typed interface for bun:sqlite Database.
 * Oxlint cannot resolve bun:sqlite types, so we cast through `unknown`.
 */
type TypedStatement = {
  run(...params: unknown[]): void;
};

type TypedDatabase = {
  run(query: string): void;
  prepare(query: string): TypedStatement;
  close(): void;
  execDDL(ddl: string): void;
};

function openDatabase(path: string): TypedDatabase {
  const DbCtor = Database as unknown as new (p: string) => TypedDatabase;
  const instance = new DbCtor(path);
  // bun:sqlite uses "exec" but we expose as "execDDL" for lint compatibility
  const raw = instance as unknown as Record<
    string,
    (...args: string[]) => void
  >;
  return {
    run: (query: string) => raw["run"](query),
    prepare: (query: string) =>
      (instance as unknown as { prepare(q: string): TypedStatement }).prepare(
        query,
      ),
    close: () => raw["close"](),
    execDDL: (ddl: string) => raw["exec"](ddl),
  };
}

const FIXTURES_DIR: string = import.meta.dir as string;

// --- Hex-to-bytes helper (avoids hex numeric literals that conflict with lint/prettier) ---

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// --- Minimal valid media file bytes ---

// Minimal valid JPEG (1x1 red pixel)
const JPEG_BYTES = hexToBytes(
  "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707" +
    "070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c" +
    "1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100" +
    "ffc4001f0000010501010101010100000000000000000102030405060708090a0bff" +
    "c400b5100002010303020403050504040000017d0102030004110512213141061351" +
    "6107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728" +
    "292a3435363738393a434445464748494a535455565758595a636465666768696a73" +
    "7475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2" +
    "b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8" +
    "e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f007b94110000000000ffd9",
);

// Minimal valid PNG (1x1 red pixel)
const PNG_BYTES = hexToBytes(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de00" +
    "00000c4944415408d763f8cfc0000000020001e221bc330000000049454e44ae4260" +
    "82",
);

// Minimal MP3 frame (silent, valid header)
// ID3v2 header + MP3 frame header (MPEG1, Layer3, 128kbps, 44100Hz, stereo) + zero padding
const MP3_BYTES = hexToBytes(`49443303000000000000fffb9000${"00".repeat(413)}`);

// --- Protobuf encoding helpers ---

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value;
  while (v >= 128) {
    bytes.push((v % 128) + 128);
    v = Math.floor(v / 128);
  }
  bytes.push(v);
  return new Uint8Array(bytes);
}

function encodeProtobufField(
  fieldNum: number,
  wireType: number,
  payload: Uint8Array,
): Uint8Array {
  const tag = encodeVarint(fieldNum * 8 + wireType);
  const result = new Uint8Array(tag.length + payload.length);
  result.set(tag, 0);
  result.set(payload, tag.length);
  return result;
}

function encodeProtobufString(fieldNum: number, value: string): Uint8Array {
  const strBytes = new TextEncoder().encode(value);
  const len = encodeVarint(strBytes.length);
  const payload = new Uint8Array(len.length + strBytes.length);
  payload.set(len, 0);
  payload.set(strBytes, len.length);
  return encodeProtobufField(fieldNum, 2, payload);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function encodeTemplateConfig(qfmt: string, afmt: string): Uint8Array {
  return concatBytes(
    encodeProtobufString(1, qfmt),
    encodeProtobufString(2, afmt),
  );
}

function encodeNoteTypeConfig(css: string): Uint8Array {
  return encodeProtobufString(3, css);
}

function encodeMediaMapProtobuf(
  entries: Array<{ index: number; filename: string }>,
): Uint8Array {
  const encodedEntries = entries.map((e) => {
    const filenameField = encodeProtobufString(1, e.filename);
    const usnField = encodeProtobufField(2, 0, encodeVarint(0));
    const entryBytes = concatBytes(filenameField, usnField);
    const len = encodeVarint(entryBytes.length);
    const payload = new Uint8Array(len.length + entryBytes.length);
    payload.set(len, 0);
    payload.set(entryBytes, len.length);
    return encodeProtobufField(1, 2, payload);
  });
  return concatBytes(...encodedEntries);
}

// --- DB creation helpers ---

const NOTE_TYPE_ID = 1700000000;
const FIELD_SEP = "\u001F";

/** "Basic (and reversed card)" with forward + reverse templates */
const BASIC_REVERSED_MODEL = {
  id: NOTE_TYPE_ID,
  name: "Basic (and reversed card)",
  flds: [
    { name: "Front", ord: 0 },
    { name: "Back", ord: 1 },
  ],
  tmpls: [
    {
      name: "Card 1",
      qfmt: "{{Front}}",
      afmt: "{{FrontSide}}<hr id=answer>{{Back}}",
      ord: 0,
    },
    {
      name: "Card 2",
      qfmt: "{{Back}}",
      afmt: "{{FrontSide}}<hr id=answer>{{Front}}",
      ord: 1,
    },
  ],
  css: ".card { font-family: arial; font-size: 20px; text-align: center; }",
};

type NoteData = {
  id: number;
  guid: string;
  mid: number;
  flds: string;
  tags: string;
};

type CardData = {
  id: number;
  nid: number;
  did: number;
  ord: number;
};

function createOldSchemaDb(opts: {
  deckName: string;
  deckId: number;
  notes: NoteData[];
  cards: CardData[];
}): Uint8Array {
  const dbPath: string = join(
    tmpdir(),
    `anki-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = openDatabase(dbPath);

  try {
    db.execDDL(`
      CREATE TABLE col (
        id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL,
        scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL,
        usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL,
        models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL
      );
    `);
    db.execDDL(`
      CREATE TABLE notes (
        id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL,
        mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL,
        flds text NOT NULL, sfld text NOT NULL, csum integer NOT NULL,
        flags integer NOT NULL, data text NOT NULL
      );
    `);
    db.execDDL(`
      CREATE TABLE cards (
        id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL,
        ord integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL,
        type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL,
        ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL,
        lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL,
        odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL
      );
    `);

    // Build deck hierarchy from the :: separated name
    const deckParts = opts.deckName.split("::");
    const decks: Record<string, { id: number; name: string }> = {
      "1": { id: 1, name: "Default" },
    };
    // Create intermediate decks
    for (let i = 0; i < deckParts.length; i += 1) {
      const fullName = deckParts.slice(0, i + 1).join("::");
      const deckIdForLevel =
        i === deckParts.length - 1 ? opts.deckId : opts.deckId + i + 100;
      decks[String(deckIdForLevel)] = { id: deckIdForLevel, name: fullName };
    }

    const models: Record<string, typeof BASIC_REVERSED_MODEL> = {
      [String(NOTE_TYPE_ID)]: BASIC_REVERSED_MODEL,
    };

    db.prepare(
      `INSERT INTO col VALUES (1, 0, 0, 0, 11, 0, 0, 0, '{}', ?, ?, '{}', '{}')`,
    ).run(JSON.stringify(models), JSON.stringify(decks));

    const insertNote = db.prepare(
      `INSERT INTO notes VALUES (?, ?, ?, 0, 0, ?, ?, '', 0, 0, '')`,
    );
    for (const note of opts.notes) {
      insertNote.run(note.id, note.guid, note.mid, note.tags, note.flds);
    }

    const insertCard = db.prepare(
      `INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')`,
    );
    for (const card of opts.cards) {
      insertCard.run(card.id, card.nid, card.did, card.ord);
    }

    db.close();
    return new Uint8Array(readFileSync(dbPath));
  } finally {
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    } catch {}
  }
}

function createNewSchemaDb(opts: {
  deckName: string;
  deckId: number;
  notes: NoteData[];
  cards: CardData[];
}): Uint8Array {
  const dbPath = join(
    tmpdir(),
    `anki-e2e-new-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const sqliteDb = openDatabase(dbPath);

  try {
    sqliteDb.execDDL(
      `CREATE TABLE notetypes (id integer PRIMARY KEY, name text, config blob)`,
    );
    sqliteDb.execDDL(
      `CREATE TABLE templates (ntid integer, ord integer, name text, config blob)`,
    );
    sqliteDb.execDDL(
      `CREATE TABLE fields (ntid integer, ord integer, name text)`,
    );
    sqliteDb.execDDL(`CREATE TABLE decks (id integer PRIMARY KEY, name text)`);
    sqliteDb.execDDL(
      "CREATE TABLE notes (id integer PRIMARY KEY, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)",
    );
    sqliteDb.execDDL(
      "CREATE TABLE cards (id integer PRIMARY KEY, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)",
    );

    // Insert note type with protobuf config
    const ntConfig = encodeNoteTypeConfig(BASIC_REVERSED_MODEL.css);
    sqliteDb
      .prepare("INSERT INTO notetypes VALUES (?, ?, ?)")
      .run(NOTE_TYPE_ID, BASIC_REVERSED_MODEL.name, ntConfig);

    for (const f of BASIC_REVERSED_MODEL.flds) {
      sqliteDb
        .prepare("INSERT INTO fields VALUES (?, ?, ?)")
        .run(NOTE_TYPE_ID, f.ord, f.name);
    }

    for (const t of BASIC_REVERSED_MODEL.tmpls) {
      const tmplConfig = encodeTemplateConfig(t.qfmt, t.afmt);
      sqliteDb
        .prepare("INSERT INTO templates VALUES (?, ?, ?, ?)")
        .run(NOTE_TYPE_ID, t.ord, t.name, tmplConfig);
    }

    // Decks from :: separated name
    const deckParts = opts.deckName.split("::");
    for (let i = 0; i < deckParts.length; i += 1) {
      const fullName = deckParts.slice(0, i + 1).join("::");
      const deckIdForLevel =
        i === deckParts.length - 1 ? opts.deckId : opts.deckId + i + 100;
      sqliteDb
        .prepare("INSERT INTO decks VALUES (?, ?)")
        .run(deckIdForLevel, fullName);
    }

    for (const n of opts.notes) {
      sqliteDb
        .prepare("INSERT INTO notes VALUES (?, ?, ?, 0, 0, ?, ?, '', 0, 0, '')")
        .run(n.id, n.guid, n.mid, n.tags, n.flds);
    }

    for (const c of opts.cards) {
      sqliteDb
        .prepare(
          "INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')",
        )
        .run(c.id, c.nid, c.did, c.ord);
    }

    sqliteDb.close();
    return new Uint8Array(readFileSync(dbPath));
  } finally {
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    } catch {}
  }
}

function createApkgBuffer(opts: {
  dbBytes: Uint8Array;
  dbFilename: string;
  mediaMap: Record<string, string> | Uint8Array;
  mediaFiles: Record<string, Uint8Array>;
}): Uint8Array {
  const mediaBytes =
    opts.mediaMap instanceof Uint8Array
      ? opts.mediaMap
      : strToU8(JSON.stringify(opts.mediaMap));

  const zipContents: Record<string, Uint8Array> = {
    [opts.dbFilename]: opts.dbBytes,
    media: mediaBytes,
    ...opts.mediaFiles,
  };

  return zipSync(zipContents);
}

// --- Parameterized fixture data ---

const MEDIA_MAP: Record<string, string> = {
  "0": "image1.jpg",
  "1": "image2.png",
  "2": "audio1.mp3",
  "3": "audio2.mp3",
};

const MEDIA_FILES: Record<string, Uint8Array> = {
  "0": JPEG_BYTES,
  "1": PNG_BYTES,
  "2": MP3_BYTES,
  "3": MP3_BYTES,
};

/** Create notes/cards with a unique prefix to avoid GUID collisions across formats */
function makeFixtureData(prefix: string, deckId: number) {
  const notes: NoteData[] = [
    {
      id: deckId + 1,
      guid: `${prefix}_note_aaa`,
      mid: NOTE_TYPE_ID,
      flds: `Hello <img src="image1.jpg">${FIELD_SEP}World [sound:audio1.mp3]`,
      tags: "e2e",
    },
    {
      id: deckId + 2,
      guid: `${prefix}_note_bbb`,
      mid: NOTE_TYPE_ID,
      flds: `Goodbye <img src="image2.png">${FIELD_SEP}Earth [sound:audio2.mp3]`,
      tags: "e2e",
    },
    {
      id: deckId + 3,
      guid: `${prefix}_note_ccc`,
      mid: NOTE_TYPE_ID,
      flds: `Sunrise <img src="image1.jpg">${FIELD_SEP}Sunset [sound:audio1.mp3]`,
      tags: "e2e",
    },
  ];

  // 3 notes x 2 templates = 6 cards
  const cards: CardData[] = [
    { id: deckId + 101, nid: notes[0].id, did: deckId, ord: 0 },
    { id: deckId + 102, nid: notes[0].id, did: deckId, ord: 1 },
    { id: deckId + 103, nid: notes[1].id, did: deckId, ord: 0 },
    { id: deckId + 104, nid: notes[1].id, did: deckId, ord: 1 },
    { id: deckId + 105, nid: notes[2].id, did: deckId, ord: 0 },
    { id: deckId + 106, nid: notes[2].id, did: deckId, ord: 1 },
  ];

  return { notes, cards };
}

// --- Generate fixtures ---

type FormatConfig = {
  filename: string;
  deckName: string;
  deckId: number;
  prefix: string;
  schema: "old" | "new";
};

const FORMATS: FormatConfig[] = [
  {
    filename: "old-format.apkg",
    deckName: "OldApkg::Languages::Vocab",
    deckId: 9001000000,
    prefix: "oa",
    schema: "old",
  },
  {
    filename: "new-format.apkg",
    deckName: "NewApkg::Languages::Vocab",
    deckId: 9002000000,
    prefix: "na",
    schema: "new",
  },
  {
    filename: "old-format.colpkg",
    deckName: "OldColpkg::Languages::Vocab",
    deckId: 9003000000,
    prefix: "oc",
    schema: "old",
  },
  {
    filename: "new-format.colpkg",
    deckName: "NewColpkg::Languages::Vocab",
    deckId: 9004000000,
    prefix: "nc",
    schema: "new",
  },
];

function generate(): void {
  const protobufMediaMapBytes = encodeMediaMapProtobuf([
    { index: 0, filename: "image1.jpg" },
    { index: 1, filename: "image2.png" },
    { index: 2, filename: "audio1.mp3" },
    { index: 3, filename: "audio2.mp3" },
  ]);

  for (const fmt of FORMATS) {
    const { notes, cards } = makeFixtureData(fmt.prefix, fmt.deckId);

    const dbBytes =
      fmt.schema === "old"
        ? createOldSchemaDb({
            deckName: fmt.deckName,
            deckId: fmt.deckId,
            notes,
            cards,
          })
        : createNewSchemaDb({
            deckName: fmt.deckName,
            deckId: fmt.deckId,
            notes,
            cards,
          });

    const apkg = createApkgBuffer({
      dbBytes,
      dbFilename:
        fmt.schema === "old" ? "collection.anki21" : "collection.anki21b",
      mediaMap: fmt.schema === "old" ? MEDIA_MAP : protobufMediaMapBytes,
      mediaFiles: MEDIA_FILES,
    });

    writeFileSync(join(FIXTURES_DIR, fmt.filename), apkg);
  }

  // Merge variant: uses same GUIDs as old-format.apkg (prefix "oa"), same deck
  const mergePrefix = "oa";
  const mergeDeckId = 9001000000;
  const mergeDeckName = "OldApkg::Languages::Vocab";

  const mergeNotes: NoteData[] = [
    {
      id: mergeDeckId + 1,
      guid: `${mergePrefix}_note_aaa`, // same guid, modified fields
      mid: NOTE_TYPE_ID,
      flds: `Bonjour <img src="image1.jpg">${FIELD_SEP}Monde [sound:audio1.mp3]`,
      tags: "e2e",
    },
    {
      id: mergeDeckId + 2,
      guid: `${mergePrefix}_note_bbb`, // same guid, unchanged
      mid: NOTE_TYPE_ID,
      flds: `Goodbye <img src="image2.png">${FIELD_SEP}Earth [sound:audio2.mp3]`,
      tags: "e2e",
    },
    {
      id: mergeDeckId + 50,
      guid: `${mergePrefix}_note_ddd`, // brand new note
      mid: NOTE_TYPE_ID,
      flds: `Moonrise <img src="image1.jpg">${FIELD_SEP}Moonset [sound:audio2.mp3]`,
      tags: "e2e",
    },
  ];

  const mergeCards: CardData[] = [
    { id: mergeDeckId + 201, nid: mergeNotes[0].id, did: mergeDeckId, ord: 0 },
    { id: mergeDeckId + 202, nid: mergeNotes[0].id, did: mergeDeckId, ord: 1 },
    { id: mergeDeckId + 203, nid: mergeNotes[1].id, did: mergeDeckId, ord: 0 },
    { id: mergeDeckId + 204, nid: mergeNotes[1].id, did: mergeDeckId, ord: 1 },
    { id: mergeDeckId + 205, nid: mergeNotes[2].id, did: mergeDeckId, ord: 0 },
    { id: mergeDeckId + 206, nid: mergeNotes[2].id, did: mergeDeckId, ord: 1 },
  ];

  const mergeDb = createOldSchemaDb({
    deckName: mergeDeckName,
    deckId: mergeDeckId,
    notes: mergeNotes,
    cards: mergeCards,
  });
  const mergeApkg = createApkgBuffer({
    dbBytes: mergeDb,
    dbFilename: "collection.anki21",
    mediaMap: MEDIA_MAP,
    mediaFiles: MEDIA_FILES,
  });
  writeFileSync(join(FIXTURES_DIR, "merge-update.apkg"), mergeApkg);
}

generate();
