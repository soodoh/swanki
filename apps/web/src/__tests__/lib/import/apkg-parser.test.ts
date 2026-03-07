import { describe, it, expect, expectTypeOf } from "vitest";
import { Database } from "bun:sqlite";
import { zipSync, strToU8 } from "fflate";
import { parseApkg } from "../../../lib/import/apkg-parser";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
  dbFilename?: string;
}): ArrayBuffer {
  const dbBytes = options?.dbBytes ?? createAnkiDb();
  const mediaMap = options?.mediaMap ?? {};
  const mediaFilesExtra = options?.mediaFiles ?? {};
  const dbFilename = options?.dbFilename ?? "collection.anki21";

  const zipContents: Record<string, Uint8Array> = {
    [dbFilename]: dbBytes,
    media: strToU8(JSON.stringify(mediaMap)),
    ...mediaFilesExtra,
  };

  const zipped = zipSync(zipContents);
  return zipped.buffer;
}

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
