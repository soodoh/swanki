import { describe, it, expect } from "vitest";
import { createTestDb } from "../../test-utils";
import {
  rewriteMediaUrls,
  extractMediaFilenames,
  ImportService,
} from "@/lib/services/import-service";
import { noteMedia, notes, media } from "@/db/schema";
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
