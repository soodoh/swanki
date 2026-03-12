/**
 * Bun script to generate APKG/COLPKG test fixtures for Playwright e2e tests.
 * Run: cd apps/web && bun run e2e/fixtures/generate-fixtures.ts
 */
import { Database } from "bun:sqlite";
import { zipSync, strToU8 } from "fflate";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync, unlinkSync, existsSync, writeFileSync } from "node:fs";

const FIXTURES_DIR = import.meta.dir;

// --- Minimal valid media file bytes ---

// Minimal valid JPEG (1x1 red pixel)
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08,
  0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a,
  0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d,
  0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22,
  0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34,
  0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0,
  0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
  0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01,
  0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13,
  0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42,
  0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a,
  0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
  0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a,
  0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67,
  0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84,
  0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3,
  0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
  0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00,
  0x00, 0x3f, 0x00, 0x7b, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xd9,
]);

// Minimal valid PNG (1x1 red pixel)
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00,
  0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

// Minimal MP3 frame (silent, valid header)
const MP3_BYTES = new Uint8Array([
  // ID3v2 header
  0x49,
  0x44,
  0x33,
  0x03,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  // MP3 frame header (MPEG1, Layer3, 128kbps, 44100Hz, stereo)
  0xff,
  0xfb,
  0x90,
  0x00,
  // Padding to make a complete frame (~417 bytes for 128kbps)
  ...new Array(413).fill(0),
]);

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
  const dbPath = join(
    tmpdir(),
    `anki-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = new Database(dbPath);

  try {
    db.exec(`
      CREATE TABLE col (
        id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL,
        scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL,
        usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL,
        models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL
      );
    `);
    db.exec(`
      CREATE TABLE notes (
        id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL,
        mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL,
        flds text NOT NULL, sfld text NOT NULL, csum integer NOT NULL,
        flags integer NOT NULL, data text NOT NULL
      );
    `);
    db.exec(`
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
    for (let i = 0; i < deckParts.length; i++) {
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
  const sqliteDb = new Database(dbPath);

  try {
    sqliteDb.run(
      `CREATE TABLE notetypes (id integer PRIMARY KEY, name text, config blob)`,
    );
    sqliteDb.run(
      `CREATE TABLE templates (ntid integer, ord integer, name text, config blob)`,
    );
    sqliteDb.run(`CREATE TABLE fields (ntid integer, ord integer, name text)`);
    sqliteDb.run(`CREATE TABLE decks (id integer PRIMARY KEY, name text)`);
    sqliteDb.run(
      "CREATE TABLE notes (id integer PRIMARY KEY, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)",
    );
    sqliteDb.run(
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
    for (let i = 0; i < deckParts.length; i++) {
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
  console.log("Generating e2e test fixtures...");

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
    console.log(`  ${fmt.filename} (deck: ${fmt.deckName})`);
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
  console.log("  merge-update.apkg");

  console.log("Done! Generated 5 fixture files.");
}

generate();
