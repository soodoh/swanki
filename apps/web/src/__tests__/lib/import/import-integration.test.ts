import { describe, it, expect, beforeEach } from "vitest";
import { Database } from "bun:sqlite";
import { zipSync, strToU8 } from "fflate";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestDb } from "../../test-utils";
import { ImportService } from "../../../lib/services/import-service";
import { parseApkg } from "../../../lib/import/apkg-parser";
import { cards, cardTemplates } from "../../../db/schema";

type TestDb = ReturnType<typeof createTestDb>;

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

describe("Import Integration", () => {
  let db: TestDb;
  let importService: ImportService;
  const userId = "test-user-1";

  beforeEach(() => {
    db = createTestDb();
    importService = new ImportService(db);
  });

  describe("APKG template ID bug fix", () => {
    it("cards reference valid template IDs that exist in card_templates", () => {
      const buffer = createApkgBuffer();
      const apkgData = parseApkg(buffer);
      importService.importFromApkg(userId, apkgData);

      const allCards = db.select().from(cards).all();
      const allTemplates = db.select().from(cardTemplates).all();
      const templateIds = new Set(allTemplates.map((t) => t.id));

      expect(allCards.length).toBeGreaterThan(0);
      for (const card of allCards) {
        expect(templateIds.has(card.templateId)).toBe(true);
      }
    });
  });
});
