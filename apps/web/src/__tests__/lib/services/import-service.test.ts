import { describe, it, expect } from "vitest";
import { createTestDb } from "../../test-utils";
import {
  rewriteMediaUrls,
  extractMediaFilenames,
  computeFieldsHash,
  ImportService,
} from "@/lib/services/import-service";
import { noteMedia, notes, media, decks, noteTypes } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("rewriteMediaUrls", () => {
  const mapping = new Map<string, string>([
    ["image.jpg", "/api/media/abc123.jpg"],
    ["sound.mp3", "/api/media/def456.mp3"],
  ]);

  it("should rewrite img src attributes", () => {
    const input = '<img src="image.jpg">';
    expect(rewriteMediaUrls(input, mapping)).toBe(
      '<img src="/api/media/abc123.jpg">',
    );
  });

  it("should rewrite Anki sound syntax", () => {
    const input = "[sound:sound.mp3]";
    expect(rewriteMediaUrls(input, mapping)).toBe(
      "[sound:/api/media/def456.mp3]",
    );
  });

  it("should handle multiple media references in one field", () => {
    const input = '<img src="image.jpg"> and [sound:sound.mp3]';
    const expected =
      '<img src="/api/media/abc123.jpg"> and [sound:/api/media/def456.mp3]';
    expect(rewriteMediaUrls(input, mapping)).toBe(expected);
  });

  it("should leave non-media text unchanged", () => {
    const input = "Plain text with no media";
    expect(rewriteMediaUrls(input, mapping)).toBe(input);
  });

  it("should leave unrecognized filenames unchanged", () => {
    const input = '<img src="unknown.jpg">';
    expect(rewriteMediaUrls(input, mapping)).toBe(input);
  });
});

describe("extractMediaFilenames", () => {
  it("should extract filenames from /api/media/ URLs in fields", () => {
    const fields = {
      Front: '<img src="/api/media/abc123.jpg">',
      Back: "Text and [sound:/api/media/def456.mp3]",
    };
    const filenames = extractMediaFilenames(fields);
    expect(filenames).toContain("abc123.jpg");
    expect(filenames).toContain("def456.mp3");
    expect(filenames).toHaveLength(2);
  });

  it("should deduplicate filenames", () => {
    const fields = {
      Front: '<img src="/api/media/abc123.jpg">',
      Back: '<img src="/api/media/abc123.jpg">',
    };
    expect(extractMediaFilenames(fields)).toHaveLength(1);
  });

  it("should return empty array for fields with no media", () => {
    const fields = { Front: "Plain text", Back: "More text" };
    expect(extractMediaFilenames(fields)).toHaveLength(0);
  });
});

describe("importFromApkg noteMedia population", () => {
  it("should create noteMedia records for notes with media references", () => {
    const db = createTestDb();
    const service = new ImportService(db);

    // Insert a mock media record
    db.insert(media)
      .values({
        id: "media-1",
        userId: "user-1",
        filename: "abc123.jpg",
        hash: "abc123",
        mimeType: "image/jpeg",
        size: 100,
        createdAt: new Date(),
      })
      .run();

    const apkgData = {
      decks: [{ id: 1, name: "Test Deck" }],
      noteTypes: [
        {
          id: 1,
          name: "Basic",
          fields: [
            { name: "Front", ordinal: 0 },
            { name: "Back", ordinal: 1 },
          ],
          templates: [
            {
              name: "Card 1",
              ordinal: 0,
              questionFormat: "{{Front}}",
              answerFormat: "{{Back}}",
            },
          ],
          css: "",
        },
      ],
      notes: [
        {
          id: 1,
          guid: "note-guid-1",
          modelId: 1,
          fields: ['<img src="image.jpg">', "Back text"],
          tags: "",
        },
      ],
      cards: [
        {
          id: 1,
          noteId: 1,
          deckId: 1,
          ordinal: 0,
          type: 0,
          queue: 0,
          due: 0,
          reps: 0,
          lapses: 0,
        },
      ],
      media: [],
    };

    const mediaMapping = new Map([["image.jpg", "/api/media/abc123.jpg"]]);
    service.importFromApkg("user-1", apkgData, mediaMapping);

    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(1);

    const refs = db
      .select()
      .from(noteMedia)
      .where(eq(noteMedia.noteId, allNotes[0].id))
      .all();
    expect(refs).toHaveLength(1);
    expect(refs[0].mediaId).toBe("media-1");
  });
});

function makeApkgData(overrides?: {
  noteGuids?: string[];
  noteFields?: string[][];
  deckName?: string;
  noteTypeName?: string;
}) {
  const noteGuids = overrides?.noteGuids ?? ["guid-1", "guid-2"];
  return {
    decks: [{ id: 1, name: overrides?.deckName ?? "Test Deck" }],
    noteTypes: [
      {
        id: 1,
        name: overrides?.noteTypeName ?? "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
        templates: [
          {
            name: "Card 1",
            ordinal: 0,
            questionFormat: "{{Front}}",
            answerFormat: "{{Back}}",
          },
        ],
        css: "",
      },
    ],
    notes: noteGuids.map((guid, i) => ({
      id: i + 1,
      guid,
      modelId: 1,
      fields: overrides?.noteFields?.[i] ?? [`Front ${i + 1}`, `Back ${i + 1}`],
      tags: "",
    })),
    cards: noteGuids.map((_, i) => ({
      id: i + 1,
      noteId: i + 1,
      deckId: 1,
      ordinal: 0,
      type: 0,
      queue: 0,
      due: 0,
      reps: 0,
      lapses: 0,
    })),
    media: [],
  };
}

describe("importFromApkg merge mode", () => {
  it("should skip unchanged notes on second import with merge=true", () => {
    const db = createTestDb();
    const service = new ImportService(db);
    const data = makeApkgData();

    const first = service.importFromApkg("user-1", data, undefined, true);
    expect(first.noteCount).toBe(2);
    expect(first.cardCount).toBe(2);
    expect(first.duplicatesSkipped).toBe(0);
    expect(first.notesUpdated).toBe(0);

    const second = service.importFromApkg("user-1", data, undefined, true);
    expect(second.noteCount).toBe(0);
    expect(second.cardCount).toBe(0);
    expect(second.duplicatesSkipped).toBe(2);
    expect(second.notesUpdated).toBe(0);

    // Should not create duplicate decks
    const allDecks = db.select().from(decks).all();
    expect(allDecks).toHaveLength(1);

    // Should not create duplicate note types
    const allNoteTypes = db.select().from(noteTypes).all();
    expect(allNoteTypes).toHaveLength(1);

    // Should still have only 2 notes total
    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(2);
  });

  it("should create duplicates on second import with merge=false", () => {
    const db = createTestDb();
    const service = new ImportService(db);
    const data = makeApkgData();

    service.importFromApkg("user-1", data, undefined, false);
    const second = service.importFromApkg("user-1", data, undefined, false);

    expect(second.noteCount).toBe(2);
    expect(second.cardCount).toBe(2);
    expect(second.duplicatesSkipped).toBe(0);

    // Should create duplicate decks
    const allDecks = db.select().from(decks).all();
    expect(allDecks).toHaveLength(2);

    // Should have 4 notes total
    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(4);
  });

  it("should import only new notes when some already exist", () => {
    const db = createTestDb();
    const service = new ImportService(db);

    // First import with 2 notes
    const data1 = makeApkgData({ noteGuids: ["guid-1", "guid-2"] });
    service.importFromApkg("user-1", data1, undefined, true);

    // Second import with 3 notes (2 existing + 1 new)
    const data2 = makeApkgData({ noteGuids: ["guid-1", "guid-2", "guid-3"] });

    const result = service.importFromApkg("user-1", data2, undefined, true);
    expect(result.noteCount).toBe(1);
    expect(result.duplicatesSkipped).toBe(2);
    expect(result.notesUpdated).toBe(0);

    // Should have 3 notes total
    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(3);
  });
});

describe("computeFieldsHash", () => {
  it("should produce consistent hashes for the same fields", () => {
    const hash1 = computeFieldsHash(["Front", "Back"]);
    const hash2 = computeFieldsHash(["Front", "Back"]);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different fields", () => {
    const hash1 = computeFieldsHash(["Front", "Back"]);
    const hash2 = computeFieldsHash(["Front", "Back Updated"]);
    expect(hash1).not.toBe(hash2);
  });

  it("should distinguish field order", () => {
    const hash1 = computeFieldsHash(["A", "B"]);
    const hash2 = computeFieldsHash(["B", "A"]);
    expect(hash1).not.toBe(hash2);
  });
});

describe("importFromApkg merge update-on-change", () => {
  it("should update notes when fields have changed", () => {
    const db = createTestDb();
    const service = new ImportService(db);

    const data1 = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [["Original Front", "Original Back"]],
    });
    service.importFromApkg("user-1", data1, undefined, true);

    const data2 = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [["Updated Front", "Updated Back"]],
    });
    const result = service.importFromApkg("user-1", data2, undefined, true);

    expect(result.notesUpdated).toBe(1);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.noteCount).toBe(0);

    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(1);
    expect(allNotes[0].fields).toStrictEqual({
      Front: "Updated Front",
      Back: "Updated Back",
    });
  });

  it("should skip notes when fields are unchanged", () => {
    const db = createTestDb();
    const service = new ImportService(db);

    const data = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [["Front 1", "Back 1"]],
    });
    service.importFromApkg("user-1", data, undefined, true);
    const result = service.importFromApkg("user-1", data, undefined, true);

    expect(result.notesUpdated).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it("should handle mix of new, updated, and unchanged notes", () => {
    const db = createTestDb();
    const service = new ImportService(db);

    // Import 2 notes
    const data1 = makeApkgData({
      noteGuids: ["guid-1", "guid-2"],
      noteFields: [
        ["Front 1", "Back 1"],
        ["Front 2", "Back 2"],
      ],
    });
    service.importFromApkg("user-1", data1, undefined, true);

    // Re-import: guid-1 unchanged, guid-2 changed, guid-3 new
    const data2 = makeApkgData({
      noteGuids: ["guid-1", "guid-2", "guid-3"],
      noteFields: [
        ["Front 1", "Back 1"],
        ["Front 2 UPDATED", "Back 2 UPDATED"],
        ["Front 3", "Back 3"],
      ],
    });
    const result = service.importFromApkg("user-1", data2, undefined, true);

    expect(result.noteCount).toBe(1); // guid-3 is new
    expect(result.notesUpdated).toBe(1); // guid-2 updated
    expect(result.duplicatesSkipped).toBe(1); // guid-1 unchanged

    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(3);
  });

  it("should rewrite media URLs in updated fields", () => {
    const db = createTestDb();
    const service = new ImportService(db);

    const data1 = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [['<img src="old.jpg">', "Back"]],
    });
    const mapping1 = new Map([["old.jpg", "/api/media/old-hash.jpg"]]);
    service.importFromApkg("user-1", data1, mapping1, true);

    const data2 = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [['<img src="new.jpg">', "Back Updated"]],
    });
    const mapping2 = new Map([["new.jpg", "/api/media/new-hash.jpg"]]);
    const result = service.importFromApkg("user-1", data2, mapping2, true);

    expect(result.notesUpdated).toBe(1);

    const allNotes = db.select().from(notes).all();
    expect(allNotes[0].fields).toStrictEqual({
      Front: '<img src="/api/media/new-hash.jpg">',
      Back: "Back Updated",
    });
  });

  it("should treat pre-migration notes (null hash) as changed on first re-import", () => {
    const db = createTestDb();
    const service = new ImportService(db);

    // Simulate a pre-migration note (no ankiFieldsHash)
    const data1 = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [["Front 1", "Back 1"]],
    });
    service.importFromApkg("user-1", data1, undefined, true);

    // Manually null out the hash to simulate pre-migration state
    db.update(notes).set({ ankiFieldsHash: null }).run();

    // Re-import with same fields — should still update (hash mismatch with null)
    const result = service.importFromApkg("user-1", data1, undefined, true);
    expect(result.notesUpdated).toBe(1);
    expect(result.duplicatesSkipped).toBe(0);

    // After update, hash should be populated
    const allNotes = db.select().from(notes).all();
    expect(allNotes[0].ankiFieldsHash).toBeTruthy();

    // Third import should now skip (hashes match)
    const result2 = service.importFromApkg("user-1", data1, undefined, true);
    expect(result2.notesUpdated).toBe(0);
    expect(result2.duplicatesSkipped).toBe(1);
  });
});
