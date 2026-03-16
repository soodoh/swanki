import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { zipSync, strToU8 } from "fflate";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestDbWithRaw } from "../../test-utils";
import {
  ImportService,
  detectFormat,
} from "../../../lib/services/import-service";
import { parseApkg } from "../../../lib/import/apkg-parser";
import { parseCsv } from "../../../lib/import/csv-parser";
import { eq } from "drizzle-orm";
import {
  cards,
  cardTemplates,
  decks,
  noteTypes,
  notes,
} from "../../../db/schema";

type TestDb = ReturnType<typeof createTestDbWithRaw>["db"];

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
      `INSERT INTO notes VALUES (?, ?, ?, 0, 0, ?, ?, '', 0, 0, '')`,
    );
    for (const note of noteList) {
      insertNote.run(
        note.id,
        `guid-${note.id}`,
        note.mid,
        note.tags,
        note.flds,
      );
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

function encodeProtobufString(fieldNum: number, value: string): Uint8Array {
  const tag = encodeVarint(fieldNum * 8 + 2);
  const strBytes = new TextEncoder().encode(value);
  const len = encodeVarint(strBytes.length);
  return concatBytes(tag, len, strBytes);
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

function createProtobufNewSchemaDb(options: {
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
}): Uint8Array {
  const dbPath = join(
    tmpdir(),
    `anki-proto-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const sqliteDb = new Database(dbPath);

  try {
    sqliteDb.exec(
      "CREATE TABLE notetypes (id integer PRIMARY KEY, name text, config blob)",
    );
    sqliteDb.exec(
      "CREATE TABLE templates (ntid integer, ord integer, name text, config blob)",
    );
    sqliteDb.exec("CREATE TABLE fields (ntid integer, ord integer, name text)");
    sqliteDb.exec("CREATE TABLE decks (id integer PRIMARY KEY, name text)");
    sqliteDb.exec(
      "CREATE TABLE notes (id integer PRIMARY KEY, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)",
    );
    sqliteDb.exec(
      "CREATE TABLE cards (id integer PRIMARY KEY, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)",
    );

    for (const nt of options.noteTypes) {
      sqliteDb
        .prepare("INSERT INTO notetypes VALUES (?, ?, ?)")
        .run(nt.id, nt.name, encodeNoteTypeConfig(nt.css));

      for (const f of nt.fields) {
        sqliteDb
          .prepare("INSERT INTO fields VALUES (?, ?, ?)")
          .run(nt.id, f.ord, f.name);
      }

      for (const t of nt.templates) {
        sqliteDb
          .prepare("INSERT INTO templates VALUES (?, ?, ?, ?)")
          .run(nt.id, t.ord, t.name, encodeTemplateConfig(t.qfmt, t.afmt));
      }
    }

    for (const d of options.decks) {
      sqliteDb.prepare("INSERT INTO decks VALUES (?, ?)").run(d.id, d.name);
    }

    for (const n of options.notes) {
      sqliteDb
        .prepare("INSERT INTO notes VALUES (?, ?, ?, 0, 0, ?, ?, '', 0, 0, '')")
        .run(n.id, `guid-${n.id}`, n.mid, n.tags, n.flds);
    }

    for (const c of options.cards) {
      sqliteDb
        .prepare(
          "INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')",
        )
        .run(c.id, c.nid, c.did, c.ord, c.type);
    }

    sqliteDb.close();
    return new Uint8Array(readFileSync(dbPath));
  } finally {
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    } catch {
      // ignore
    }
  }
}

describe("Import Integration", () => {
  let db: TestDb;
  let importService: ImportService;
  const userId = "test-user-1";

  beforeEach(() => {
    const testDb = createTestDbWithRaw();
    db = testDb.db;
    importService = new ImportService(testDb.db, {
      execSQL: (sql: string) => testDb.rawDb.exec(sql),
    });
  });

  describe("APKG template ID bug fix", () => {
    it("cards reference valid template IDs that exist in card_templates", async () => {
      const buffer = createApkgBuffer();
      const apkgData = parseApkg(buffer);
      await importService.importFromApkg(userId, apkgData);

      const allCards = db.select().from(cards).all();
      const allTemplates = db.select().from(cardTemplates).all();
      const templateIds = new Set(allTemplates.map((t) => t.id));

      expect(allCards.length).toBeGreaterThan(0);
      for (const card of allCards) {
        expect(templateIds.has(card.templateId)).toBe(true);
      }
    });
  });

  describe("CSV import", () => {
    it("imports comma-separated file with headers end-to-end", async () => {
      const csvText = "Front,Back\nhello,world\nfoo,bar\n";
      const parsed = parseCsv(csvText, { delimiter: ",", hasHeader: true });
      const result = await importService.importFromCsv(userId, {
        headers: parsed.headers,
        rows: parsed.rows,
        deckName: "My CSV Deck",
      });

      expect(result.noteCount).toBe(2);
      expect(result.cardCount).toBe(2);
      expect(result.deckId).toBeDefined();

      // Verify deck
      const allDecks = db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks).toHaveLength(1);
      expect(allDecks[0].name).toBe("My CSV Deck");

      // Verify notes have correct field values
      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(2);
      const fields = allNotes.map((n) => n.fields);
      expect(fields).toContainEqual({ Front: "hello", Back: "world" });
      expect(fields).toContainEqual({ Front: "foo", Back: "bar" });

      // Verify cards reference valid templates
      const allCards = db.select().from(cards).all();
      const allTemplates = db.select().from(cardTemplates).all();
      expect(allCards).toHaveLength(2);
      expect(allTemplates).toHaveLength(1);
      for (const card of allCards) {
        expect(card.templateId).toBe(allTemplates[0].id);
      }
    });
  });

  describe("TXT (tab-separated) import", () => {
    it("imports tab-separated file with headers end-to-end", async () => {
      const txtText =
        "Question\tAnswer\nWhat is 2+2?\t4\nCapital of France?\tParis\n";
      const parsed = parseCsv(txtText, { delimiter: "\t", hasHeader: true });
      const result = await importService.importFromCsv(userId, {
        headers: parsed.headers,
        rows: parsed.rows,
        deckName: "My TXT Deck",
      });

      expect(result.noteCount).toBe(2);
      expect(result.cardCount).toBe(2);

      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      const fields = allNotes.map((n) => n.fields);
      expect(fields).toContainEqual({ Question: "What is 2+2?", Answer: "4" });
      expect(fields).toContainEqual({
        Question: "Capital of France?",
        Answer: "Paris",
      });
    });
  });

  describe("CrowdAnki JSON import", () => {
    it("imports deck with notes, cards, and note type CSS", async () => {
      const json = {
        name: "Geography",
        children: [],
        note_models: [
          {
            crowdanki_uuid: "model-uuid-1",
            name: "Basic",
            flds: [
              { name: "Country", ord: 0 },
              { name: "Capital", ord: 1 },
            ],
            tmpls: [
              {
                name: "Card 1",
                qfmt: "{{Country}}",
                afmt: "{{FrontSide}}<hr>{{Capital}}",
                ord: 0,
              },
            ],
            css: ".card { color: black; }",
          },
        ],
        notes: [
          {
            fields: ["France", "Paris"],
            tags: ["europe"],
            note_model_uuid: "model-uuid-1",
            guid: "guid-1",
          },
          {
            fields: ["Japan", "Tokyo"],
            tags: ["asia"],
            note_model_uuid: "model-uuid-1",
            guid: "guid-2",
          },
        ],
        media_files: [],
      };

      const result = await importService.importFromCrowdAnki(userId, json);

      expect(result.deckCount).toBe(1);
      expect(result.noteCount).toBe(2);
      expect(result.cardCount).toBe(2);

      // Verify deck
      const allDecks = db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks).toHaveLength(1);
      expect(allDecks[0].name).toBe("Geography");

      // Verify note type has correct CSS
      const allNoteTypes = db
        .select()
        .from(noteTypes)
        .where(eq(noteTypes.userId, userId))
        .all();
      expect(allNoteTypes).toHaveLength(1);
      expect(allNoteTypes[0].name).toBe("Basic");
      // .card { ... } rules are stripped at import time
      expect(allNoteTypes[0].css).toBe("");

      // Verify notes have correct field values
      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(2);
      const fields = allNotes.map((n) => n.fields);
      expect(fields).toContainEqual({ Country: "France", Capital: "Paris" });
      expect(fields).toContainEqual({ Country: "Japan", Capital: "Tokyo" });

      // Verify cards reference valid templates
      const allCards = db.select().from(cards).all();
      const allTemplates = db.select().from(cardTemplates).all();
      expect(allCards).toHaveLength(2);
      expect(allTemplates).toHaveLength(1);
      const templateIds = new Set(allTemplates.map((t) => t.id));
      for (const card of allCards) {
        expect(templateIds.has(card.templateId)).toBe(true);
      }
    });
  });

  describe("APKG import", () => {
    it("imports deck with scheduling data preserved", async () => {
      const modelId = 111;
      const ankiDeckId = 555;

      const dbBytes = createAnkiDb({
        models: {
          [String(modelId)]: {
            id: modelId,
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
        },
        decks: {
          [String(ankiDeckId)]: { id: ankiDeckId, name: "Spanish" },
        },
        notes: [
          {
            id: 1001,
            mid: modelId,
            flds: "hola\u001Fhello",
            tags: "greetings",
          },
          { id: 1002, mid: modelId, flds: "gato\u001Fcat", tags: "animals" },
        ],
        cards: [
          {
            id: 2001,
            nid: 1001,
            did: ankiDeckId,
            ord: 0,
            type: 2,
            queue: 2,
            due: 100,
            ivl: 30,
            factor: 2500,
            reps: 10,
            lapses: 2,
          },
          {
            id: 2002,
            nid: 1002,
            did: ankiDeckId,
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
      const apkgData = parseApkg(buffer);
      const result = await importService.importFromApkg(userId, apkgData);

      expect(result.deckCount).toBe(1);
      expect(result.noteCount).toBe(2);
      expect(result.cardCount).toBe(2);

      // Verify deck
      const allDecks = db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks).toHaveLength(1);
      expect(allDecks[0].name).toBe("Spanish");

      // Verify notes have correct field values
      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(2);
      const fields = allNotes.map((n) => n.fields);
      expect(fields).toContainEqual({ Front: "hola", Back: "hello" });
      expect(fields).toContainEqual({ Front: "gato", Back: "cat" });

      // Verify scheduling data preserved
      const allCards = db.select().from(cards).all();
      expect(allCards).toHaveLength(2);

      const reviewedCard = allCards.find((c) => c.reps === 10);
      expect(reviewedCard).toBeDefined();
      expect(reviewedCard!.state).toBe(2);
      expect(reviewedCard!.lapses).toBe(2);

      const newCard = allCards.find((c) => c.reps === 0);
      expect(newCard).toBeDefined();
      expect(newCard!.state).toBe(0);
      expect(newCard!.lapses).toBe(0);

      // Verify cards reference valid templates
      const allTemplates = db.select().from(cardTemplates).all();
      const templateIds = new Set(allTemplates.map((t) => t.id));
      for (const card of allCards) {
        expect(templateIds.has(card.templateId)).toBe(true);
      }
    });
  });

  describe("COLPKG import", () => {
    it("imports a collection package with correct counts", async () => {
      const buffer = createApkgBuffer();
      const apkgData = parseApkg(buffer);
      const result = await importService.importFromApkg(userId, apkgData);

      expect(result.deckCount).toBeGreaterThan(0);
      expect(result.noteCount).toBeGreaterThan(0);
      expect(result.cardCount).toBeGreaterThan(0);

      const allDecks = db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks.length).toBeGreaterThan(0);

      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes.length).toBeGreaterThan(0);

      const allCards = db.select().from(cards).all();
      expect(allCards.length).toBeGreaterThan(0);
    });
  });

  // --- CSV Edge Cases ---

  describe("CSV edge cases", () => {
    it("auto-generates field names when no header row is present", async () => {
      const csvText = "apple,red\nbanana,yellow\n";
      const parsed = parseCsv(csvText, { hasHeader: false });
      const result = await importService.importFromCsv(userId, {
        rows: parsed.rows,
        deckName: "No Header Deck",
      });

      expect(result.noteCount).toBe(2);
      expect(result.cardCount).toBe(2);

      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(2);
      const fields = allNotes.map((n) => n.fields);
      expect(fields).toContainEqual({ "Field 1": "apple", "Field 2": "red" });
      expect(fields).toContainEqual({
        "Field 1": "banana",
        "Field 2": "yellow",
      });

      const allNoteTypes = db
        .select()
        .from(noteTypes)
        .where(eq(noteTypes.userId, userId))
        .all();
      expect(allNoteTypes).toHaveLength(1);
      const fieldDefs = allNoteTypes[0].fields as Array<{
        name: string;
        ordinal: number;
      }>;
      expect(fieldDefs.map((f) => f.name)).toStrictEqual([
        "Field 1",
        "Field 2",
      ]);
    });

    it("handles single-column CSV with header", async () => {
      const csvText = "Term\napple\nbanana\ncherry\n";
      const parsed = parseCsv(csvText, { hasHeader: true });
      const result = await importService.importFromCsv(userId, {
        headers: parsed.headers,
        rows: parsed.rows,
        deckName: "Single Column Deck",
      });

      expect(result.noteCount).toBe(3);
      expect(result.cardCount).toBe(3);

      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(3);
      const fields = allNotes.map((n) => n.fields);
      expect(fields).toContainEqual({ Term: "apple" });
      expect(fields).toContainEqual({ Term: "banana" });
      expect(fields).toContainEqual({ Term: "cherry" });

      const allTemplates = db.select().from(cardTemplates).all();
      expect(allTemplates).toHaveLength(1);
      // Templates are stored as raw mustache HTML
      expect(allTemplates[0].questionTemplate).toContain("{{Term}}");
      expect(allTemplates[0].answerTemplate).toContain("{{Term}}");
    });

    it("preserves quoted fields with embedded commas and newlines", async () => {
      const csvText = 'Front,Back\n"hello, world","line1\nline2"\n';
      const parsed = parseCsv(csvText, { hasHeader: true });
      const result = await importService.importFromCsv(userId, {
        headers: parsed.headers,
        rows: parsed.rows,
        deckName: "Quoted Fields Deck",
      });

      expect(result.noteCount).toBe(1);
      expect(result.cardCount).toBe(1);

      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(1);
      expect(allNotes[0].fields).toStrictEqual({
        Front: "hello, world",
        Back: "line1\nline2",
      });
    });

    it("creates deck with 0 cards for empty CSV", async () => {
      const result = await importService.importFromCsv(userId, {
        rows: [],
        headers: ["Front", "Back"],
        deckName: "Empty Deck",
      });

      expect(result.noteCount).toBe(0);
      expect(result.cardCount).toBe(0);
      expect(result.deckId).toBeDefined();

      const allDecks = db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks).toHaveLength(1);
      expect(allDecks[0].name).toBe("Empty Deck");

      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(0);
    });
  });

  // --- CrowdAnki Edge Cases ---

  describe("CrowdAnki edge cases", () => {
    it("preserves nested deck hierarchy with parent-child relationships", async () => {
      const json = {
        name: "Languages",
        children: [
          {
            name: "Spanish",
            children: [
              {
                name: "Verbs",
                children: [],
                note_models: [],
                notes: [],
                media_files: [],
              },
            ],
            note_models: [],
            notes: [],
            media_files: [],
          },
          {
            name: "French",
            children: [],
            note_models: [],
            notes: [],
            media_files: [],
          },
        ],
        note_models: [
          {
            crowdanki_uuid: "model-uuid-1",
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
            css: ".card {}",
          },
        ],
        notes: [],
        media_files: [],
      };

      const result = await importService.importFromCrowdAnki(userId, json);
      expect(result.deckCount).toBe(4);
      expect(result.noteCount).toBe(0);
      expect(result.cardCount).toBe(0);

      const allDecks = db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks).toHaveLength(4);

      const root = allDecks.find((d) => d.name === "Languages")!;
      const spanish = allDecks.find((d) => d.name === "Spanish")!;
      const verbs = allDecks.find((d) => d.name === "Verbs")!;
      const french = allDecks.find((d) => d.name === "French")!;

      expect(root.parentId).toBeNull();
      expect(spanish.parentId).toBe(root.id);
      expect(verbs.parentId).toBe(spanish.id);
      expect(french.parentId).toBe(root.id);
    });

    it("handles empty notes array", async () => {
      const json = {
        name: "Empty Deck",
        children: [],
        note_models: [
          {
            crowdanki_uuid: "model-uuid-1",
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
            css: "",
          },
        ],
        notes: [],
        media_files: [],
      };

      const result = await importService.importFromCrowdAnki(userId, json);
      expect(result.deckCount).toBe(1);
      expect(result.noteCount).toBe(0);
      expect(result.cardCount).toBe(0);

      const allDecks = db
        .select()
        .from(decks)
        .where(eq(decks.userId, userId))
        .all();
      expect(allDecks).toHaveLength(1);
      expect(allDecks[0].name).toBe("Empty Deck");
    });
  });

  // --- APKG Edge Cases ---

  describe("APKG with multiple note types", () => {
    it("imports Basic and Cloze note types with correct template references", async () => {
      const dbBytes = createAnkiDb({
        decks: { "1": { id: 1, name: "Mixed" } },
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
        notes: [
          { id: 1, mid: 111, flds: "Q\u001FA", tags: "" },
          { id: 2, mid: 222, flds: "{{c1::answer}}", tags: "" },
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
        ],
      });

      const buffer = createApkgBuffer({ dbBytes });
      const apkgData = parseApkg(buffer);
      const result = await importService.importFromApkg(userId, apkgData);

      expect(result.noteCount).toBe(2);
      expect(result.cardCount).toBe(2);

      const allNoteTypes = db
        .select()
        .from(noteTypes)
        .where(eq(noteTypes.userId, userId))
        .all();
      expect(allNoteTypes).toHaveLength(2);
      const names = allNoteTypes.map((nt) => nt.name).toSorted();
      expect(names).toStrictEqual(["Basic", "Cloze"]);

      const allCards = db.select().from(cards).all();
      const allTemplates = db.select().from(cardTemplates).all();
      const templateIds = new Set(allTemplates.map((t) => t.id));
      for (const card of allCards) {
        expect(templateIds.has(card.templateId)).toBe(true);
      }
    });
  });

  // --- APKG New Schema (Anki 2.1.50+) ---

  describe("APKG new schema (anki21b)", () => {
    it("imports deck from new-schema database with separate tables", async () => {
      // Create a new-schema Anki database with notetypes/fields/templates tables
      const dbPath = join(
        tmpdir(),
        `anki-new-schema-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
      );
      const sqliteDb = new Database(dbPath);
      try {
        sqliteDb.exec(
          "CREATE TABLE notetypes (id integer PRIMARY KEY, name text, css text DEFAULT '')",
        );
        sqliteDb.exec(
          "CREATE TABLE fields (ntid integer, ord integer, name text)",
        );
        sqliteDb.exec(
          "CREATE TABLE templates (ntid integer, ord integer, name text, qfmt text, afmt text)",
        );
        sqliteDb.exec("CREATE TABLE decks (id integer PRIMARY KEY, name text)");
        sqliteDb.exec(
          "CREATE TABLE notes (id integer PRIMARY KEY, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)",
        );
        sqliteDb.exec(
          "CREATE TABLE cards (id integer PRIMARY KEY, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)",
        );
        sqliteDb.exec(
          "INSERT INTO notetypes VALUES (1, 'Basic', '.card { color: red; }')",
        );
        sqliteDb.exec("INSERT INTO fields VALUES (1, 0, 'Front')");
        sqliteDb.exec("INSERT INTO fields VALUES (1, 1, 'Back')");
        sqliteDb.exec(
          "INSERT INTO templates VALUES (1, 0, 'Card 1', '{{Front}}', '{{FrontSide}}<hr>{{Back}}')",
        );
        sqliteDb.exec("INSERT INTO decks VALUES (1, 'NewFormat Deck')");
        sqliteDb.exec(
          "INSERT INTO notes VALUES (100, 'g1', 1, 0, 0, 'tag1', 'hola\u001Fhello', 'hola', 0, 0, '')",
        );
        sqliteDb.exec(
          "INSERT INTO cards VALUES (200, 100, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')",
        );
        sqliteDb.close();

        const dbBytesNew = new Uint8Array(readFileSync(dbPath));
        const buffer = createApkgBuffer({
          dbBytes: dbBytesNew,
          dbFilename: "collection.anki21b",
        });
        const apkgData = parseApkg(buffer);
        const result = await importService.importFromApkg(userId, apkgData);

        expect(result.deckCount).toBe(1);
        expect(result.noteCount).toBe(1);
        expect(result.cardCount).toBe(1);

        // Verify deck name
        const allDecks = db
          .select()
          .from(decks)
          .where(eq(decks.userId, userId))
          .all();
        expect(allDecks).toHaveLength(1);
        expect(allDecks[0].name).toBe("NewFormat Deck");

        // Verify note type CSS preserved
        const allNoteTypes = db
          .select()
          .from(noteTypes)
          .where(eq(noteTypes.userId, userId))
          .all();
        expect(allNoteTypes).toHaveLength(1);
        // .card { ... } rules are stripped at import time
        expect(allNoteTypes[0].css).toBe("");

        // Verify note fields
        const allNotes = db
          .select()
          .from(notes)
          .where(eq(notes.userId, userId))
          .all();
        expect(allNotes).toHaveLength(1);
        expect(allNotes[0].fields).toStrictEqual({
          Front: "hola",
          Back: "hello",
        });

        // Verify cards reference valid templates
        const allCards = db.select().from(cards).all();
        const allTemplates = db.select().from(cardTemplates).all();
        const templateIds = new Set(allTemplates.map((t) => t.id));
        for (const card of allCards) {
          expect(templateIds.has(card.templateId)).toBe(true);
        }
      } finally {
        try {
          unlinkSync(dbPath);
        } catch {
          // ignore cleanup errors
        }
      }
    });

    it("imports deck from protobuf config database end-to-end", async () => {
      const dbBytes = createProtobufNewSchemaDb({
        noteTypes: [
          {
            id: 1,
            name: "Geography",
            css: ".card { background: #eee; font-size: 18px; }",
            fields: [
              { name: "Country", ord: 0 },
              { name: "Capital", ord: 1 },
              { name: "Flag", ord: 2 },
            ],
            templates: [
              {
                name: "Country → Capital",
                qfmt: "<div>{{Country}}</div>",
                afmt: "<div>{{Capital}}</div>",
                ord: 0,
              },
              {
                name: "Capital → Country",
                qfmt: "<div>{{Capital}}</div>",
                afmt: "<div>{{Country}}</div>",
                ord: 1,
              },
            ],
          },
        ],
        decks: [{ id: 1, name: "World Capitals" }],
        notes: [
          { id: 10, mid: 1, flds: "France\u001FParis\u001F🇫🇷", tags: "europe" },
          { id: 11, mid: 1, flds: "Japan\u001FTokyo\u001F🇯🇵", tags: "asia" },
        ],
        cards: [
          { id: 100, nid: 10, did: 1, ord: 0, type: 0 },
          { id: 101, nid: 10, did: 1, ord: 1, type: 0 },
          { id: 102, nid: 11, did: 1, ord: 0, type: 0 },
          { id: 103, nid: 11, did: 1, ord: 1, type: 0 },
        ],
      });

      const buffer = createApkgBuffer({
        dbBytes,
        dbFilename: "collection.anki21b",
      });
      const apkgData = parseApkg(buffer);
      const result = await importService.importFromApkg(userId, apkgData);

      expect(result.deckCount).toBe(1);
      expect(result.noteCount).toBe(2);
      expect(result.cardCount).toBe(4);

      // Verify CSS preserved from protobuf
      const allNoteTypes = db
        .select()
        .from(noteTypes)
        .where(eq(noteTypes.userId, userId))
        .all();
      expect(allNoteTypes).toHaveLength(1);
      // .card { ... } rules are stripped at import time
      expect(allNoteTypes[0].css).toBe("");

      // Verify templates have correct field references (raw mustache HTML)
      const allTemplates = db.select().from(cardTemplates).all();
      expect(allTemplates).toHaveLength(2);
      const sorted = allTemplates.toSorted((a, b) => a.ordinal - b.ordinal);
      expect(sorted[0].questionTemplate).toContain("Country");
      expect(sorted[0].answerTemplate).toContain("Capital");
      expect(sorted[1].questionTemplate).toContain("Capital");
      expect(sorted[1].answerTemplate).toContain("Country");

      // Verify notes have 3 fields
      const allNotes = db
        .select()
        .from(notes)
        .where(eq(notes.userId, userId))
        .all();
      expect(allNotes).toHaveLength(2);
      const france = allNotes.find((n) => n.fields.Country === "France");
      expect(france).toBeDefined();
      expect(france!.fields.Capital).toBe("Paris");
      expect(france!.fields.Flag).toBe("🇫🇷");

      // Verify all cards reference valid templates
      const allCards = db.select().from(cards).all();
      const templateIds = new Set(allTemplates.map((t) => t.id));
      for (const card of allCards) {
        expect(templateIds.has(card.templateId)).toBe(true);
      }
    });
  });

  // --- Format Detection ---

  describe("Format detection", () => {
    it("rejects unsupported file formats", () => {
      expect(detectFormat("file.pdf")).toBeUndefined();
      expect(detectFormat("file.docx")).toBeUndefined();
      expect(detectFormat("file.xlsx")).toBeUndefined();
      expect(detectFormat("noextension")).toBeUndefined();
    });
  });
});
