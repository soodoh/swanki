import { describe, it, expect } from "vitest";
import { createTestDbWithRaw } from "../../test-utils";
import {
  rewriteMediaUrls,
  extractMediaFilenames,
  stripAddonMarkup,
  ImportService,
} from "@/lib/services/import-service";
import { NoteService } from "@/lib/services/note-service";
import { noteMedia, notes, media, decks, noteTypes } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("rewriteMediaUrls", () => {
  const mapping = new Map<string, string>([
    ["image.jpg", "abc123.jpg"],
    ["sound.mp3", "def456.mp3"],
  ]);

  it("should rewrite img tags to [image:] bracket tags", () => {
    const input = '<img src="image.jpg">';
    expect(rewriteMediaUrls(input, mapping)).toBe("[image:abc123.jpg]");
  });

  it("should rewrite Anki [sound:] to [audio:] bracket tags", () => {
    const input = "[sound:sound.mp3]";
    expect(rewriteMediaUrls(input, mapping)).toBe("[audio:def456.mp3]");
  });

  it("should handle multiple media references in one field", () => {
    const input = '<img src="image.jpg"> and [sound:sound.mp3]';
    const expected = "[image:abc123.jpg] and [audio:def456.mp3]";
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

  it("should rewrite single-quoted img src attributes", () => {
    const input = "<img src='image.jpg'>";
    expect(rewriteMediaUrls(input, mapping)).toBe("[image:abc123.jpg]");
  });

  it("should rewrite unquoted img src attributes", () => {
    const input = "<img src=image.jpg>";
    expect(rewriteMediaUrls(input, mapping)).toBe("[image:abc123.jpg]");
  });
});

describe("stripAddonMarkup", () => {
  it("should strip script tags", () => {
    const input = '{{Front}}\n<script src="_ch-highlight.js"></script>';
    expect(stripAddonMarkup(input)).toBe("{{Front}}");
  });

  it("should strip link tags", () => {
    const input =
      '{{Front}}\n<link rel="stylesheet" href="_ch-pygments.css" class="anki-code-highlighter">';
    expect(stripAddonMarkup(input)).toBe("{{Front}}");
  });

  it("should strip HTML comments", () => {
    const input =
      "{{Front}}\n<!-- Anki Code Highlighter BEGIN -->\n<!-- END -->";
    expect(stripAddonMarkup(input)).toBe("{{Front}}");
  });

  it("should strip a full addon block with comments, links, and scripts", () => {
    const input = `{{Front}}

<!-- Anki Code Highlighter (Addon 112228974) BEGIN -->
<link rel="stylesheet" href="_ch-pygments-solarized.css" class="anki-code-highlighter">
<link rel="stylesheet" href="_tokyo-night-dark.css" class="anki-code-highlighter">
<script src="_ch-highlight.js" class="anki-code-highlighter"></script>
<script src="_ch-my-highlight.js" class="anki-code-highlighter"></script>
<!-- Anki Code Highlighter (Addon 112228974) END -->`;
    expect(stripAddonMarkup(input)).toBe("{{Front}}");
  });

  it("should strip script tags with inline content", () => {
    const input = "{{Front}}\n<script>console.log('hi');</script>";
    expect(stripAddonMarkup(input)).toBe("{{Front}}");
  });

  it("should leave templates without addon markup unchanged", () => {
    const input = "{{Front}}\n<hr>\n{{Back}}";
    expect(stripAddonMarkup(input)).toBe("{{Front}}\n<hr>\n{{Back}}");
  });
});

describe("extractMediaFilenames", () => {
  it("should extract filenames from bracket media tags in fields", () => {
    const fields = {
      Front: "[image:abc123.jpg]",
      Back: "Text and [audio:def456.mp3]",
    };
    const filenames = extractMediaFilenames(fields);
    expect(filenames).toContain("abc123.jpg");
    expect(filenames).toContain("def456.mp3");
    expect(filenames).toHaveLength(2);
  });

  it("should deduplicate filenames", () => {
    const fields = {
      Front: "[image:abc123.jpg]",
      Back: "[image:abc123.jpg]",
    };
    expect(extractMediaFilenames(fields)).toHaveLength(1);
  });

  it("should return empty array for fields with no media", () => {
    const fields = { Front: "Plain text", Back: "More text" };
    expect(extractMediaFilenames(fields)).toHaveLength(0);
  });
});

describe("importFromApkg noteMedia population", () => {
  it("should create noteMedia records for notes with media references", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });

    // Insert a mock media record (id is now the content hash)
    db.insert(media)
      .values({
        id: "abc123",
        userId: "user-1",
        filename: "abc123.jpg",
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

    const mediaMapping = new Map([["image.jpg", "abc123.jpg"]]);
    await service.importFromApkg("user-1", apkgData, mediaMapping);

    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(1);

    const refs = db
      .select()
      .from(noteMedia)
      .where(eq(noteMedia.noteId, allNotes[0].id))
      .all();
    expect(refs).toHaveLength(1);
    const mediaRecord = db.select().from(media).all()[0];
    expect(refs[0].mediaId).toBe(mediaRecord.id);
  });
});

function makeApkgData(overrides?: {
  noteGuids?: string[];
  noteFields?: string[][];
  deckName?: string;
  noteTypeName?: string;
  decks?: Array<{ id: number; name: string }>;
  cardDeckIds?: number[];
}) {
  const noteGuids = overrides?.noteGuids ?? ["guid-1", "guid-2"];
  const deckList = overrides?.decks ?? [
    { id: 1, name: overrides?.deckName ?? "Test Deck" },
  ];
  return {
    decks: deckList,
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
      deckId: overrides?.cardDeckIds?.[i] ?? 1,
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
  it("should skip unchanged notes on second import with merge=true", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });
    const data = makeApkgData();

    const first = await service.importFromApkg("user-1", data, undefined, true);
    expect(first.noteCount).toBe(2);
    expect(first.cardCount).toBe(2);
    expect(first.duplicatesSkipped).toBe(0);
    expect(first.notesUpdated).toBe(0);

    const second = await service.importFromApkg(
      "user-1",
      data,
      undefined,
      true,
    );
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

  it("should skip duplicate notes on second import with merge=false", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });
    const data = makeApkgData();

    await service.importFromApkg("user-1", data, undefined, false);
    const second = await service.importFromApkg(
      "user-1",
      data,
      undefined,
      false,
    );

    // Notes with existing ankiGuid are skipped (unique constraint)
    expect(second.noteCount).toBe(0);
    expect(second.cardCount).toBe(0);
    expect(second.duplicatesSkipped).toBe(2);

    // Should create duplicate decks (decks don't have unique constraint)
    const allDecks = db.select().from(decks).all();
    expect(allDecks).toHaveLength(2);

    // Should have only 2 notes (no duplicates)
    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(2);
  });

  it("should import only new notes when some already exist", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });

    // First import with 2 notes
    const data1 = makeApkgData({ noteGuids: ["guid-1", "guid-2"] });
    await service.importFromApkg("user-1", data1, undefined, true);

    // Second import with 3 notes (2 existing + 1 new)
    const data2 = makeApkgData({ noteGuids: ["guid-1", "guid-2", "guid-3"] });

    const result = await service.importFromApkg(
      "user-1",
      data2,
      undefined,
      true,
    );
    expect(result.noteCount).toBe(1);
    expect(result.duplicatesSkipped).toBe(2);
    expect(result.notesUpdated).toBe(0);

    // Should have 3 notes total
    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(3);
  });
});

describe("importFromApkg merge update-on-change", () => {
  it("should update notes when fields have changed", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });

    const data1 = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [["Original Front", "Original Back"]],
    });
    await service.importFromApkg("user-1", data1, undefined, true);

    const data2 = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [["Updated Front", "Updated Back"]],
    });
    const result = await service.importFromApkg(
      "user-1",
      data2,
      undefined,
      true,
    );

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

  it("should skip notes when fields are unchanged", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });

    const data = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [["Front 1", "Back 1"]],
    });
    await service.importFromApkg("user-1", data, undefined, true);
    const result = await service.importFromApkg(
      "user-1",
      data,
      undefined,
      true,
    );

    expect(result.notesUpdated).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it("should handle mix of new, updated, and unchanged notes", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });

    // Import 2 notes
    const data1 = makeApkgData({
      noteGuids: ["guid-1", "guid-2"],
      noteFields: [
        ["Front 1", "Back 1"],
        ["Front 2", "Back 2"],
      ],
    });
    await service.importFromApkg("user-1", data1, undefined, true);

    // Re-import: guid-1 unchanged, guid-2 changed, guid-3 new
    const data2 = makeApkgData({
      noteGuids: ["guid-1", "guid-2", "guid-3"],
      noteFields: [
        ["Front 1", "Back 1"],
        ["Front 2 UPDATED", "Back 2 UPDATED"],
        ["Front 3", "Back 3"],
      ],
    });
    const result = await service.importFromApkg(
      "user-1",
      data2,
      undefined,
      true,
    );

    expect(result.noteCount).toBe(1); // guid-3 is new
    expect(result.notesUpdated).toBe(1); // guid-2 updated
    expect(result.duplicatesSkipped).toBe(1); // guid-1 unchanged

    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(3);
  });

  it("should rewrite media URLs in updated fields", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });

    const data1 = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [['<img src="old.jpg">', "Back"]],
    });
    const mapping1 = new Map([["old.jpg", "old-hash.jpg"]]);
    await service.importFromApkg("user-1", data1, mapping1, true);

    const data2 = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [['<img src="new.jpg">', "Back Updated"]],
    });
    const mapping2 = new Map([["new.jpg", "new-hash.jpg"]]);
    const result = await service.importFromApkg(
      "user-1",
      data2,
      mapping2,
      true,
    );

    expect(result.notesUpdated).toBe(1);

    const allNotes = db.select().from(notes).all();
    expect(allNotes[0].fields).toStrictEqual({
      Front: "[image:new-hash.jpg]",
      Back: "Back Updated",
    });
  });

  it("should overwrite locally-edited notes on re-import", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const importService = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });
    const noteService = new NoteService(db);

    // Step 1: Import an APKG with merge mode
    const data = makeApkgData({
      noteGuids: ["guid-1"],
      noteFields: [["Original Front", "Original Back"]],
    });
    await importService.importFromApkg("user-1", data, undefined, true);

    // Step 2: Edit the note locally via NoteService
    const allNotes = db.select().from(notes).all();
    expect(allNotes).toHaveLength(1);
    await noteService.update(allNotes[0].id, "user-1", {
      fields: { Front: "Locally Edited Front", Back: "Locally Edited Back" },
    });

    const editedNote = db.select().from(notes).all()[0];
    expect(editedNote.fields).toStrictEqual({
      Front: "Locally Edited Front",
      Back: "Locally Edited Back",
    });

    // Step 3: Re-import the same APKG — should detect field divergence and update
    const result = await importService.importFromApkg(
      "user-1",
      data,
      undefined,
      true,
    );
    expect(result.notesUpdated).toBe(1);
    expect(result.duplicatesSkipped).toBe(0);

    // Step 4: Verify fields are restored to APKG values
    const restoredNote = db.select().from(notes).all()[0];
    expect(restoredNote.fields).toStrictEqual({
      Front: "Original Front",
      Back: "Original Back",
    });

    // Step 5: Re-importing again should now skip (fields match)
    const result2 = await importService.importFromApkg(
      "user-1",
      data,
      undefined,
      true,
    );
    expect(result2.notesUpdated).toBe(0);
    expect(result2.duplicatesSkipped).toBe(1);
  });
});

describe("importFromApkg nested deck hierarchy", () => {
  it("should create nested decks from :: separated names", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });
    const data = makeApkgData({
      noteGuids: ["guid-1"],
      decks: [{ id: 1, name: "A::B::C" }],
    });

    await service.importFromApkg("user-1", data);

    const allDecks = db.select().from(decks).all();
    expect(allDecks).toHaveLength(3);

    const deckA = allDecks.find((d) => d.name === "A");
    const deckB = allDecks.find((d) => d.name === "B");
    const deckC = allDecks.find((d) => d.name === "C");

    expect(deckA).toBeDefined();
    expect(deckB).toBeDefined();
    expect(deckC).toBeDefined();

    expect(deckA!.parentId).toBeNull();
    expect(deckB!.parentId).toBe(deckA!.id);
    expect(deckC!.parentId).toBe(deckB!.id);
  });

  it("should deduplicate shared prefixes across decks", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });
    const data = makeApkgData({
      noteGuids: ["guid-1", "guid-2"],
      decks: [
        { id: 1, name: "A::B::C" },
        { id: 2, name: "A::B::D" },
      ],
      cardDeckIds: [1, 2],
    });

    await service.importFromApkg("user-1", data);

    const allDecks = db.select().from(decks).all();
    // A, B, C, D — shared prefix A::B is not duplicated
    expect(allDecks).toHaveLength(4);

    const deckA = allDecks.filter((d) => d.name === "A");
    const deckB = allDecks.filter((d) => d.name === "B");
    expect(deckA).toHaveLength(1);
    expect(deckB).toHaveLength(1);

    const deckC = allDecks.find((d) => d.name === "C");
    const deckD = allDecks.find((d) => d.name === "D");
    expect(deckC!.parentId).toBe(deckB[0].id);
    expect(deckD!.parentId).toBe(deckB[0].id);
  });

  it("should create flat deck with no parentId for simple names", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });
    const data = makeApkgData({
      noteGuids: ["guid-1"],
      decks: [{ id: 1, name: "Simple Deck" }],
    });

    await service.importFromApkg("user-1", data);

    const allDecks = db.select().from(decks).all();
    expect(allDecks).toHaveLength(1);
    expect(allDecks[0].name).toBe("Simple Deck");
    expect(allDecks[0].parentId).toBeNull();
  });

  it("should handle Anki unit separator U+001F in deck names", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });
    const data = makeApkgData({
      noteGuids: ["guid-1"],
      decks: [{ id: 1, name: "Music\u001FTheory\u001FChords" }],
    });

    await service.importFromApkg("user-1", data);

    const allDecks = db.select().from(decks).all();
    expect(allDecks).toHaveLength(3);

    const music = allDecks.find((d) => d.name === "Music");
    const theory = allDecks.find((d) => d.name === "Theory");
    const chords = allDecks.find((d) => d.name === "Chords");

    expect(music!.parentId).toBeNull();
    expect(theory!.parentId).toBe(music!.id);
    expect(chords!.parentId).toBe(theory!.id);
  });

  it("should not duplicate decks on merge re-import with hierarchy", async () => {
    const { db, rawDb } = createTestDbWithRaw();
    const service = new ImportService(db, {
      execSQL: (sql: string) => rawDb.run(sql),
    });
    const data = makeApkgData({
      noteGuids: ["guid-1"],
      decks: [{ id: 1, name: "A::B::C" }],
    });

    await service.importFromApkg("user-1", data, undefined, true);
    await service.importFromApkg("user-1", data, undefined, true);

    const allDecks = db.select().from(decks).all();
    // Should still be 3, not 6
    expect(allDecks).toHaveLength(3);
  });
});
