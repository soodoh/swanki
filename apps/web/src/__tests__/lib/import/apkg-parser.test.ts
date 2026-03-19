/// <reference types="bun-types" />
import { describe, it, expect, expectTypeOf } from "vitest";
import { Database } from "bun:sqlite";
import { zipSync, strToU8 } from "fflate";
import { parseApkg } from "../../../lib/import/apkg-parser";
import { existsSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

/**
 * Creates a minimal Anki SQLite database file, returns the bytes.
 */
function createAnkiDb(options?: {
  models?: Record<
    string,
    {
      id: number;
      name: string;
      flds: Array<{ name: string; ord: number }>;
      tmpls: Array<{ name: string; qfmt: string; afmt: string; ord: number }>;
      css?: string;
    }
  >;
  decks?: Record<string, { id: number; name: string }>;
  notes?: Array<{
    id: number;
    mid: number;
    flds: string;
    tags: string;
  }>;
  cards?: Array<{
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
  }>;
}): Uint8Array {
  const dbPath = join(
    tmpdir(),
    `anki-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = new Database(dbPath);

  try {
    // Create Anki schema
    db.exec(`
      CREATE TABLE col (
        id integer PRIMARY KEY,
        crt integer NOT NULL,
        mod integer NOT NULL,
        scm integer NOT NULL,
        ver integer NOT NULL,
        dty integer NOT NULL,
        usn integer NOT NULL,
        ls integer NOT NULL,
        conf text NOT NULL,
        models text NOT NULL,
        decks text NOT NULL,
        dconf text NOT NULL,
        tags text NOT NULL
      );
    `);

    db.exec(`
      CREATE TABLE notes (
        id integer PRIMARY KEY,
        guid text NOT NULL,
        mid integer NOT NULL,
        mod integer NOT NULL,
        usn integer NOT NULL,
        tags text NOT NULL,
        flds text NOT NULL,
        sfld text NOT NULL,
        csum integer NOT NULL,
        flags integer NOT NULL,
        data text NOT NULL
      );
    `);

    db.exec(`
      CREATE TABLE cards (
        id integer PRIMARY KEY,
        nid integer NOT NULL,
        did integer NOT NULL,
        ord integer NOT NULL,
        mod integer NOT NULL,
        usn integer NOT NULL,
        type integer NOT NULL,
        queue integer NOT NULL,
        due integer NOT NULL,
        ivl integer NOT NULL,
        factor integer NOT NULL,
        reps integer NOT NULL,
        lapses integer NOT NULL,
        left integer NOT NULL,
        odue integer NOT NULL,
        odid integer NOT NULL,
        flags integer NOT NULL,
        data text NOT NULL
      );
    `);

    // Default models
    const models = options?.models ?? {
      "1234567890": {
        id: 1234567890,
        name: "Basic",
        flds: [
          { name: "Front", ord: 0 },
          { name: "Back", ord: 1 },
        ],
        tmpls: [
          {
            name: "Card 1",
            qfmt: "{{Front}}",
            afmt: "{{FrontSide}}<hr>{{Back}}",
            ord: 0,
          },
        ],
        css: ".card { font-family: arial; }",
      },
    };

    // Default decks
    const decks = options?.decks ?? {
      "1": { id: 1, name: "Default" },
      "9876543210": { id: 9876543210, name: "My Deck" },
    };

    // Insert col row
    db.prepare(
      `INSERT INTO col VALUES (1, 0, 0, 0, 11, 0, 0, 0, '{}', ?, ?, '{}', '{}')`,
    ).run(JSON.stringify(models), JSON.stringify(decks));

    // Insert notes
    const noteList = options?.notes ?? [
      {
        id: 100,
        mid: 1234567890,
        flds: "hello\u001Fworld",
        tags: "tag1 tag2",
      },
    ];

    const insertNote = db.prepare(
      `INSERT INTO notes VALUES (?, 'guid', ?, 0, 0, ?, ?, '', 0, 0, '')`,
    );
    for (const note of noteList) {
      insertNote.run(note.id, note.mid, note.tags, note.flds);
    }

    // Insert cards
    const cardList = options?.cards ?? [
      {
        id: 200,
        nid: 100,
        did: 9876543210,
        ord: 0,
        type: 0,
        queue: 0,
        due: 0,
        ivl: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
      },
    ];

    const insertCard = db.prepare(
      `INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '')`,
    );
    for (const card of cardList) {
      insertCard.run(
        card.id,
        card.nid,
        card.did,
        card.ord,
        card.type,
        card.queue,
        card.due,
        card.ivl,
        card.factor,
        card.reps,
        card.lapses,
      );
    }

    db.close();

    // Read the file as bytes
    const bytes = readFileSync(dbPath);
    return new Uint8Array(bytes);
  } finally {
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

function createApkgBuffer(options?: {
  dbBytes?: Uint8Array;
  mediaMap?: Record<string, string>;
  mediaFiles?: Record<string, Uint8Array>;
  mediaRaw?: Uint8Array;
  dbFilename?: string;
}): ArrayBuffer {
  const dbBytes = options?.dbBytes ?? createAnkiDb();
  const mediaFilesExtra = options?.mediaFiles ?? {};
  const dbFilename = options?.dbFilename ?? "collection.anki21";

  const mediaBytes =
    options?.mediaRaw ?? strToU8(JSON.stringify(options?.mediaMap ?? {}));

  const zipContents: Record<string, Uint8Array> = {
    [dbFilename]: dbBytes,
    media: mediaBytes,
    ...mediaFilesExtra,
  };

  const zipped = zipSync(zipContents);
  return zipped.buffer;
}

// --- Protobuf encoding helpers for test data ---

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

/** Encode template config protobuf: field 1 = qfmt, field 2 = afmt */
function encodeTemplateConfig(qfmt: string, afmt: string): Uint8Array {
  return concatBytes(
    encodeProtobufString(1, qfmt),
    encodeProtobufString(2, afmt),
  );
}

/** Encode notetype config protobuf: field 3 = css */
function encodeNoteTypeConfig(css: string): Uint8Array {
  return encodeProtobufString(3, css);
}

/** Encode a protobuf media map: repeated field 1 = MediaEntry(field 1 = index varint, field 2 = filename string) */
function encodeMediaMapProtobuf(
  entries: Array<{ index: number; filename: string }>,
): Uint8Array {
  // Anki protobuf schema: repeated MediaEntry (field 1), each with:
  //   field 1 = name (string), field 2 = usn (varint), field 3 = sha256 (bytes)
  // The zip index is determined by position in the repeated field.
  const encodedEntries = entries.map((e) => {
    const filenameField = encodeProtobufString(1, e.filename);
    // Include a dummy usn field to match real Anki format
    const usnField = encodeProtobufField(2, 0, encodeVarint(0));
    const entryBytes = concatBytes(filenameField, usnField);

    // Wrap as embedded message (field 1, wire type 2)
    const len = encodeVarint(entryBytes.length);
    const payload = new Uint8Array(len.length + entryBytes.length);
    payload.set(len, 0);
    payload.set(entryBytes, len.length);
    return encodeProtobufField(1, 2, payload);
  });

  return concatBytes(...encodedEntries);
}

/**
 * Creates a new-schema Anki database (2.1.50+ with separate tables).
 * When useProtobufConfig is true, uses config BLOB columns instead of text columns.
 */
function createNewSchemaAnkiDb(options: {
  noteTypes: Array<{
    id: number;
    name: string;
    css: string;
    fields: Array<{ name: string; ord: number }>;
    templates: Array<{ name: string; qfmt: string; afmt: string; ord: number }>;
  }>;
  decks: Array<{ id: number; name: string }>;
  notes: Array<{ id: number; mid: number; flds: string; tags: string }>;
  cards: Array<{
    id: number;
    nid: number;
    did: number;
    ord: number;
    type: number;
  }>;
  useProtobufConfig?: boolean;
  useUnicaseCollation?: boolean;
}): Uint8Array {
  const dbPath = join(
    tmpdir(),
    `anki-new-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const sqliteDb = new Database(dbPath);

  try {
    // Use "nocase" as placeholder; we'll binary-replace it with "unicase" after closing
    const collation = options.useUnicaseCollation ? "COLLATE nocase" : "";

    if (options.useProtobufConfig) {
      sqliteDb.exec(
        `CREATE TABLE notetypes (id integer PRIMARY KEY, name text ${collation}, config blob)`,
      );
      sqliteDb.exec(
        `CREATE TABLE templates (ntid integer, ord integer, name text, config blob)`,
      );
    } else {
      sqliteDb.exec(
        `CREATE TABLE notetypes (id integer PRIMARY KEY, name text ${collation}, css text DEFAULT '')`,
      );
      sqliteDb.exec(
        `CREATE TABLE templates (ntid integer, ord integer, name text, qfmt text, afmt text)`,
      );
    }

    sqliteDb.exec(
      `CREATE TABLE fields (ntid integer, ord integer, name text ${collation})`,
    );
    sqliteDb.exec(
      `CREATE TABLE decks (id integer PRIMARY KEY, name text ${collation})`,
    );
    sqliteDb.exec(
      "CREATE TABLE notes (id integer PRIMARY KEY, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)",
    );
    sqliteDb.exec(
      "CREATE TABLE cards (id integer PRIMARY KEY, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)",
    );

    for (const nt of options.noteTypes) {
      if (options.useProtobufConfig) {
        const configBlob = encodeNoteTypeConfig(nt.css);
        sqliteDb
          .prepare("INSERT INTO notetypes VALUES (?, ?, ?)")
          .run(nt.id, nt.name, configBlob);
      } else {
        sqliteDb
          .prepare("INSERT INTO notetypes VALUES (?, ?, ?)")
          .run(nt.id, nt.name, nt.css);
      }

      for (const f of nt.fields) {
        sqliteDb
          .prepare("INSERT INTO fields VALUES (?, ?, ?)")
          .run(nt.id, f.ord, f.name);
      }

      for (const t of nt.templates) {
        if (options.useProtobufConfig) {
          const tmplConfig = encodeTemplateConfig(t.qfmt, t.afmt);
          sqliteDb
            .prepare("INSERT INTO templates VALUES (?, ?, ?, ?)")
            .run(nt.id, t.ord, t.name, tmplConfig);
        } else {
          sqliteDb
            .prepare("INSERT INTO templates VALUES (?, ?, ?, ?, ?)")
            .run(nt.id, t.ord, t.name, t.qfmt, t.afmt);
        }
      }
    }

    for (const d of options.decks) {
      sqliteDb.prepare("INSERT INTO decks VALUES (?, ?)").run(d.id, d.name);
    }

    for (const n of options.notes) {
      sqliteDb
        .prepare(
          "INSERT INTO notes VALUES (?, 'guid', ?, 0, 0, ?, ?, '', 0, 0, '')",
        )
        .run(n.id, n.mid, n.tags, n.flds);
    }

    for (const c of options.cards) {
      sqliteDb
        .prepare(
          "INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')",
        )
        .run(c.id, c.nid, c.did, c.ord, c.type);
    }

    sqliteDb.close();
    let bytes = new Uint8Array(readFileSync(dbPath));

    // Binary-replace "nocase " → "unicase" to simulate Anki's custom collation
    // Both are 7 bytes, so this is length-preserving and safe for SQLite pages
    if (options.useUnicaseCollation) {
      bytes = patchCollation(
        bytes,
        [110, 111, 99, 97, 115, 101, 32], // "nocase "
        [117, 110, 105, 99, 97, 115, 101], // "unicase"
      );
    }

    return bytes;
  } finally {
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

/** Length-preserving binary replacement of a 7-byte sequence in raw SQLite bytes */
function patchCollation(
  data: Uint8Array,
  from: number[],
  to: number[],
): Uint8Array {
  const patched = new Uint8Array(data);
  for (let i = 0; i <= patched.length - 7; i += 1) {
    if (
      patched[i] === from[0] &&
      patched[i + 1] === from[1] &&
      patched[i + 2] === from[2] &&
      patched[i + 3] === from[3] &&
      patched[i + 4] === from[4] &&
      patched[i + 5] === from[5] &&
      patched[i + 6] === from[6]
    ) {
      for (let j = 0; j < 7; j += 1) {
        patched[i + j] = to[j];
      }
    }
  }
  return patched;
}

const hasZstd = spawnSync("which", ["zstd"]).status === 0;

/** Compress data with zstd using the CLI. Returns undefined if zstd is not available. */
function zstdCompress(data: Uint8Array): Uint8Array | undefined {
  const inputPath = join(tmpdir(), `zstd-in-${Date.now()}.bin`);
  const outputPath = `${inputPath}.zst`;
  try {
    writeFileSync(inputPath, data);
    const result = spawnSync("zstd", ["-f", "-q", inputPath, "-o", outputPath]);
    if (result.status !== 0) {
      return undefined;
    }
    return new Uint8Array(readFileSync(outputPath));
  } catch {
    return undefined;
  } finally {
    try {
      if (existsSync(inputPath)) {
        unlinkSync(inputPath);
      }
      if (existsSync(outputPath)) {
        unlinkSync(outputPath);
      }
    } catch {
      // ignore
    }
  }
}

const NEW_SCHEMA_DEFAULTS = {
  noteTypes: [
    {
      id: 1,
      name: "Basic",
      css: ".card { color: blue; }",
      fields: [
        { name: "Front", ord: 0 },
        { name: "Back", ord: 1 },
      ],
      templates: [
        {
          name: "Card 1",
          qfmt: "{{Front}}",
          afmt: "{{FrontSide}}<hr>{{Back}}",
          ord: 0,
        },
      ],
    },
  ],
  decks: [{ id: 1, name: "Test Deck" }],
  notes: [{ id: 100, mid: 1, flds: "hello\u001Fworld", tags: "test" }],
  cards: [{ id: 200, nid: 100, did: 1, ord: 0, type: 0 }],
} as const;

describe("parseApkg", () => {
  it("extracts deck names", async () => {
    const buffer = createApkgBuffer();
    const data = await parseApkg(buffer);

    const deckNames = data.decks.map((d) => d.name);
    expect(deckNames).toContain("Default");
    expect(deckNames).toContain("My Deck");
  });

  it("extracts deck ids", async () => {
    const buffer = createApkgBuffer();
    const data = await parseApkg(buffer);

    expect(data.decks).toHaveLength(2);
    for (const deck of data.decks) {
      expectTypeOf(deck.id).toBeNumber();
      expectTypeOf(deck.name).toBeString();
    }
  });

  it("extracts note types with fields", async () => {
    const buffer = createApkgBuffer();
    const data = await parseApkg(buffer);

    expect(data.noteTypes).toHaveLength(1);
    expect(data.noteTypes[0].name).toBe("Basic");
    expect(data.noteTypes[0].fields).toStrictEqual([
      { name: "Front", ordinal: 0 },
      { name: "Back", ordinal: 1 },
    ]);
    expect(data.noteTypes[0].templates).toHaveLength(1);
    expect(data.noteTypes[0].templates[0].name).toBe("Card 1");
    expect(data.noteTypes[0].css).toBe(".card { font-family: arial; }");
  });

  it("extracts notes with field values", async () => {
    const buffer = createApkgBuffer();
    const data = await parseApkg(buffer);

    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].id).toBe(100);
    expect(data.notes[0].modelId).toBe(1234567890);
    expect(data.notes[0].fields).toStrictEqual(["hello", "world"]);
    expect(data.notes[0].tags).toBe("tag1 tag2");
  });

  it("extracts cards with scheduling data", async () => {
    const dbBytes = createAnkiDb({
      cards: [
        {
          id: 300,
          nid: 100,
          did: 9876543210,
          ord: 0,
          type: 2,
          queue: 2,
          due: 19500,
          ivl: 30,
          factor: 2500,
          reps: 10,
          lapses: 2,
        },
      ],
    });
    const buffer = createApkgBuffer({ dbBytes });
    const data = await parseApkg(buffer);

    expect(data.cards).toHaveLength(1);
    expect(data.cards[0].id).toBe(300);
    expect(data.cards[0].noteId).toBe(100);
    expect(data.cards[0].deckId).toBe(9876543210);
    expect(data.cards[0].ordinal).toBe(0);
    expect(data.cards[0].type).toBe(2);
    expect(data.cards[0].queue).toBe(2);
    expect(data.cards[0].due).toBe(19500);
    expect(data.cards[0].interval).toBe(30);
    expect(data.cards[0].factor).toBe(2500);
    expect(data.cards[0].reps).toBe(10);
    expect(data.cards[0].lapses).toBe(2);
  });

  it("handles media file mapping", async () => {
    const mediaMap = { "0": "image.jpg", "1": "audio.mp3" };
    const mediaFiles = {
      // oxlint-disable-next-line eslint-plugin-unicorn(number-literal-case) -- prettier enforces lowercase hex
      "0": new Uint8Array([0xff, 0xd8, 0xff]),
      "1": new Uint8Array([0x49, 0x44, 0x33]),
    };
    const buffer = createApkgBuffer({ mediaMap, mediaFiles });
    const data = await parseApkg(buffer);

    expect(data.media).toHaveLength(2);
    const mediaNames = data.media.map((m) => m.filename);
    expect(mediaNames).toContain("image.jpg");
    expect(mediaNames).toContain("audio.mp3");

    const imageEntry = data.media.find((m) => m.filename === "image.jpg");
    expect(imageEntry).toBeDefined();
    expect(imageEntry!.data).toBeInstanceOf(Uint8Array);
    expect(imageEntry!.data).toHaveLength(3);
  });

  it("handles collection.anki2 filename", async () => {
    const buffer = createApkgBuffer({ dbFilename: "collection.anki2" });
    const data = await parseApkg(buffer);

    expect(data.decks.length).toBeGreaterThan(0);
    expect(data.notes.length).toBeGreaterThan(0);
  });

  it("handles multiple notes", async () => {
    const dbBytes = createAnkiDb({
      notes: [
        { id: 1, mid: 1234567890, flds: "q1\u001Fa1", tags: "" },
        { id: 2, mid: 1234567890, flds: "q2\u001Fa2", tags: "tagged" },
        { id: 3, mid: 1234567890, flds: "q3\u001Fa3", tags: "" },
      ],
      cards: [
        {
          id: 10,
          nid: 1,
          did: 1,
          ord: 0,
          type: 0,
          queue: 0,
          due: 0,
          ivl: 0,
          factor: 0,
          reps: 0,
          lapses: 0,
        },
        {
          id: 11,
          nid: 2,
          did: 1,
          ord: 0,
          type: 0,
          queue: 0,
          due: 0,
          ivl: 0,
          factor: 0,
          reps: 0,
          lapses: 0,
        },
        {
          id: 12,
          nid: 3,
          did: 1,
          ord: 0,
          type: 0,
          queue: 0,
          due: 0,
          ivl: 0,
          factor: 0,
          reps: 0,
          lapses: 0,
        },
      ],
    });
    const buffer = createApkgBuffer({ dbBytes });
    const data = await parseApkg(buffer);

    expect(data.notes).toHaveLength(3);
    expect(data.cards).toHaveLength(3);
    expect(data.notes[0].fields).toStrictEqual(["q1", "a1"]);
    expect(data.notes[1].fields).toStrictEqual(["q2", "a2"]);
    expect(data.notes[2].fields).toStrictEqual(["q3", "a3"]);
  });

  it("handles empty media map", async () => {
    const buffer = createApkgBuffer({ mediaMap: {} });
    const data = await parseApkg(buffer);

    expect(data.media).toStrictEqual([]);
  });

  it("extracts multiple note types", async () => {
    const dbBytes = createAnkiDb({
      models: {
        "111": {
          id: 111,
          name: "Basic",
          flds: [
            { name: "Front", ord: 0 },
            { name: "Back", ord: 1 },
          ],
          tmpls: [
            {
              name: "Card 1",
              qfmt: "{{Front}}",
              afmt: "{{Back}}",
              ord: 0,
            },
          ],
          css: "",
        },
        "222": {
          id: 222,
          name: "Cloze",
          flds: [{ name: "Text", ord: 0 }],
          tmpls: [
            {
              name: "Cloze",
              qfmt: "{{cloze:Text}}",
              afmt: "{{cloze:Text}}",
              ord: 0,
            },
          ],
          css: ".cloze { color: blue; }",
        },
      },
      notes: [],
      cards: [],
    });
    const buffer = createApkgBuffer({ dbBytes });
    const data = await parseApkg(buffer);

    expect(data.noteTypes).toHaveLength(2);
    const names = data.noteTypes.map((nt) => nt.name).toSorted();
    expect(names).toStrictEqual(["Basic", "Cloze"]);
  });
});

describe("parseApkg — Anki 2.1.50+ format", () => {
  it("parses new-schema database with protobuf config blobs", () => {
    const dbBytes = createNewSchemaAnkiDb({
      ...NEW_SCHEMA_DEFAULTS,
      useProtobufConfig: true,
    });
    const buffer = createApkgBuffer({
      dbBytes,
      dbFilename: "collection.anki21b",
    });
    const data = parseApkg(buffer);

    expect(data.decks).toHaveLength(1);
    expect(data.decks[0].name).toBe("Test Deck");

    expect(data.noteTypes).toHaveLength(1);
    expect(data.noteTypes[0].name).toBe("Basic");
    expect(data.noteTypes[0].css).toBe(".card { color: blue; }");
    expect(data.noteTypes[0].fields).toStrictEqual([
      { name: "Front", ordinal: 0 },
      { name: "Back", ordinal: 1 },
    ]);
    expect(data.noteTypes[0].templates).toHaveLength(1);
    expect(data.noteTypes[0].templates[0].questionFormat).toBe("{{Front}}");
    expect(data.noteTypes[0].templates[0].answerFormat).toBe(
      "{{FrontSide}}<hr>{{Back}}",
    );

    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].fields).toStrictEqual(["hello", "world"]);

    expect(data.cards).toHaveLength(1);
  });

  it("extracts CSS and templates from protobuf with multiple note types", () => {
    const dbBytes = createNewSchemaAnkiDb({
      noteTypes: [
        {
          id: 1,
          name: "Basic",
          css: ".card { font-size: 20px; }",
          fields: [
            { name: "Front", ord: 0 },
            { name: "Back", ord: 1 },
          ],
          templates: [
            {
              name: "Forward",
              qfmt: "{{Front}}",
              afmt: "{{Back}}",
              ord: 0,
            },
            {
              name: "Reverse",
              qfmt: "{{Back}}",
              afmt: "{{Front}}",
              ord: 1,
            },
          ],
        },
        {
          id: 2,
          name: "Cloze",
          css: ".cloze { font-weight: bold; }",
          fields: [{ name: "Text", ord: 0 }],
          templates: [
            {
              name: "Cloze",
              qfmt: "{{cloze:Text}}",
              afmt: "{{cloze:Text}}<br>notes",
              ord: 0,
            },
          ],
        },
      ],
      decks: [{ id: 1, name: "Deck" }],
      notes: [],
      cards: [],
      useProtobufConfig: true,
    });
    const buffer = createApkgBuffer({
      dbBytes,
      dbFilename: "collection.anki21b",
    });
    const data = parseApkg(buffer);

    expect(data.noteTypes).toHaveLength(2);

    const basic = data.noteTypes.find((nt) => nt.name === "Basic");
    expect(basic).toBeDefined();
    expect(basic!.css).toBe(".card { font-size: 20px; }");
    expect(basic!.templates).toHaveLength(2);
    expect(basic!.templates[0].questionFormat).toBe("{{Front}}");
    expect(basic!.templates[0].answerFormat).toBe("{{Back}}");
    expect(basic!.templates[1].questionFormat).toBe("{{Back}}");
    expect(basic!.templates[1].answerFormat).toBe("{{Front}}");

    const cloze = data.noteTypes.find((nt) => nt.name === "Cloze");
    expect(cloze).toBeDefined();
    expect(cloze!.css).toBe(".cloze { font-weight: bold; }");
    expect(cloze!.templates[0].questionFormat).toBe("{{cloze:Text}}");
  });

  it("patches unicase collation to allow querying", () => {
    const dbBytes = createNewSchemaAnkiDb({
      ...NEW_SCHEMA_DEFAULTS,
      useUnicaseCollation: true,
    });
    const buffer = createApkgBuffer({
      dbBytes,
      dbFilename: "collection.anki21b",
    });

    // Should not throw — unicase is patched to nocase
    const data = parseApkg(buffer);
    expect(data.decks).toHaveLength(1);
    expect(data.decks[0].name).toBe("Test Deck");
    expect(data.noteTypes).toHaveLength(1);
    expect(data.notes).toHaveLength(1);
  });

  it("patches unicase collation with protobuf config", () => {
    const dbBytes = createNewSchemaAnkiDb({
      ...NEW_SCHEMA_DEFAULTS,
      useProtobufConfig: true,
      useUnicaseCollation: true,
    });
    const buffer = createApkgBuffer({
      dbBytes,
      dbFilename: "collection.anki21b",
    });

    const data = parseApkg(buffer);
    expect(data.noteTypes[0].css).toBe(".card { color: blue; }");
    expect(data.noteTypes[0].templates[0].questionFormat).toBe("{{Front}}");
  });

  it.skipIf(!hasZstd)("handles zstd-compressed database file", () => {
    const dbBytes = createNewSchemaAnkiDb(NEW_SCHEMA_DEFAULTS);
    const compressed = zstdCompress(dbBytes)!;

    const buffer = createApkgBuffer({
      dbBytes: compressed,
      dbFilename: "collection.anki21b",
    });
    const data = parseApkg(buffer);

    expect(data.decks).toHaveLength(1);
    expect(data.decks[0].name).toBe("Test Deck");
    expect(data.noteTypes).toHaveLength(1);
    expect(data.notes).toHaveLength(1);
    expect(data.cards).toHaveLength(1);
  });

  it.skipIf(!hasZstd)(
    "handles zstd-compressed database with protobuf config",
    () => {
      const dbBytes = createNewSchemaAnkiDb({
        ...NEW_SCHEMA_DEFAULTS,
        useProtobufConfig: true,
      });
      const compressed = zstdCompress(dbBytes)!;

      const buffer = createApkgBuffer({
        dbBytes: compressed,
        dbFilename: "collection.anki21b",
      });
      const data = parseApkg(buffer);

      expect(data.noteTypes[0].css).toBe(".card { color: blue; }");
      expect(data.noteTypes[0].templates[0].questionFormat).toBe("{{Front}}");
      expect(data.noteTypes[0].templates[0].answerFormat).toBe(
        "{{FrontSide}}<hr>{{Back}}",
      );
      expect(data.notes[0].fields).toStrictEqual(["hello", "world"]);
    },
  );

  it.skipIf(!hasZstd)(
    "handles zstd + unicase + protobuf combined (real-world scenario)",
    () => {
      const dbBytes = createNewSchemaAnkiDb({
        ...NEW_SCHEMA_DEFAULTS,
        useProtobufConfig: true,
        useUnicaseCollation: true,
      });
      const compressed = zstdCompress(dbBytes)!;

      const buffer = createApkgBuffer({
        dbBytes: compressed,
        dbFilename: "collection.anki21b",
      });
      const data = parseApkg(buffer);

      expect(data.decks[0].name).toBe("Test Deck");
      expect(data.noteTypes[0].css).toBe(".card { color: blue; }");
      expect(data.noteTypes[0].templates[0].questionFormat).toBe("{{Front}}");
      expect(data.notes[0].fields).toStrictEqual(["hello", "world"]);
      expect(data.cards).toHaveLength(1);
    },
  );

  it("prefers collection.anki21b over collection.anki21", () => {
    const newSchemaDb = createNewSchemaAnkiDb(NEW_SCHEMA_DEFAULTS);
    const oldSchemaDb = createAnkiDb();

    // Create zip with both files
    const zipContents: Record<string, Uint8Array> = {
      "collection.anki21b": newSchemaDb,
      "collection.anki21": oldSchemaDb,
      media: strToU8(JSON.stringify({})),
    };
    const zipped = zipSync(zipContents);
    const data = parseApkg(zipped.buffer);

    // Should use the new schema (Test Deck) not old schema (Default, My Deck)
    expect(data.decks).toHaveLength(1);
    expect(data.decks[0].name).toBe("Test Deck");
  });

  it("handles protobuf-encoded media map", () => {
    const dbBytes = createNewSchemaAnkiDb(NEW_SCHEMA_DEFAULTS);
    const mediaMapBytes = encodeMediaMapProtobuf([
      { index: 0, filename: "photo.jpg" },
      { index: 1, filename: "sound.mp3" },
    ]);

    const buffer = createApkgBuffer({
      dbBytes,
      dbFilename: "collection.anki21b",
      mediaRaw: mediaMapBytes,
      mediaFiles: {
        // oxlint-disable-next-line eslint-plugin-unicorn(number-literal-case) -- prettier enforces lowercase hex
        "0": new Uint8Array([0xff, 0xd8, 0xff]),
        "1": new Uint8Array([0x49, 0x44, 0x33]),
      },
    });
    const data = parseApkg(buffer);

    expect(data.media).toHaveLength(2);
    const mediaNames = data.media.map((m) => m.filename);
    expect(mediaNames).toContain("photo.jpg");
    expect(mediaNames).toContain("sound.mp3");

    const photoEntry = data.media.find((m) => m.filename === "photo.jpg");
    expect(photoEntry).toBeDefined();
    expect(photoEntry!.data).toHaveLength(3);
    expect(photoEntry!.index).toBe("0");
  });

  it.skipIf(!hasZstd)("handles zstd-compressed protobuf media map", () => {
    const dbBytes = createNewSchemaAnkiDb(NEW_SCHEMA_DEFAULTS);
    const mediaMapBytes = encodeMediaMapProtobuf([
      { index: 0, filename: "image.png" },
    ]);
    const compressedMedia = zstdCompress(mediaMapBytes)!;

    const buffer = createApkgBuffer({
      dbBytes,
      dbFilename: "collection.anki21b",
      mediaRaw: compressedMedia,
      mediaFiles: {
        // oxlint-disable-next-line eslint-plugin-unicorn(number-literal-case) -- prettier enforces lowercase hex
        "0": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      },
    });
    const data = parseApkg(buffer);

    expect(data.media).toHaveLength(1);
    expect(data.media[0].filename).toBe("image.png");
    expect(data.media[0].data).toHaveLength(4);
  });
});
