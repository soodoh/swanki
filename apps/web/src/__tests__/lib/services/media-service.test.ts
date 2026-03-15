import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, testMediaDir } from "../../test-utils";
import { MediaService } from "@/lib/services/media-service";
import { media, noteMedia } from "@/db/schema";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type Db = BetterSQLite3Database<typeof schema>;

describe("MediaService.importBatch", () => {
  let db: Db;
  let service: MediaService;
  let testDir: string;

  beforeEach(() => {
    testDir = join(testMediaDir, crypto.randomUUID());
    db = createTestDb();
    service = new MediaService(db, testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should save media files and return filename mapping", async () => {
    const entries = [
      {
        filename: "image.jpg",
        index: "0",
        // oxlint-disable-next-line eslint-plugin-unicorn(number-literal-case) -- prettier enforces lowercase hex
        data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      },
      {
        filename: "sound.mp3",
        index: "1",
        data: new Uint8Array([0x49, 0x44, 0x33]),
      },
    ];

    const { mapping, warnings } = await service.importBatch("user-1", entries);

    expect(mapping.size).toBe(2);
    expect(mapping.get("image.jpg")).toMatch(/^[a-f0-9]+\.jpg$/);
    expect(mapping.get("sound.mp3")).toMatch(/^[a-f0-9]+\.mp3$/);
    expect(warnings).toHaveLength(0);

    const records = db.select().from(media).all();
    expect(records).toHaveLength(2);
  });

  it("should deduplicate identical files", async () => {
    // oxlint-disable-next-line eslint-plugin-unicorn(number-literal-case) -- prettier enforces lowercase hex
    const sameData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const entries = [
      { filename: "copy1.png", index: "0", data: sameData },
      { filename: "copy2.png", index: "1", data: sameData },
    ];

    const { mapping } = await service.importBatch("user-1", entries);

    expect(mapping.get("copy1.png")).toBe(mapping.get("copy2.png"));

    const records = db.select().from(media).all();
    expect(records).toHaveLength(1);
  });

  it("should skip entries with no data and return warning", async () => {
    const entries = [
      { filename: "missing.jpg", index: "0", data: new Uint8Array(0) },
    ];

    const { mapping, warnings } = await service.importBatch("user-1", entries);
    expect(mapping.size).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("missing.jpg");
  });

  it("should skip unsupported MIME types and return warning", async () => {
    const entries = [
      {
        filename: "document.pdf",
        index: "0",
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      },
    ];

    const { mapping, warnings } = await service.importBatch("user-1", entries);
    expect(mapping.size).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("document.pdf");
    expect(warnings[0]).toContain("unsupported");
  });
});

describe("MediaService.reconcileNoteReferences", () => {
  let db: Db;
  let service: MediaService;
  let testDir: string;

  beforeEach(() => {
    testDir = join(testMediaDir, crypto.randomUUID());
    db = createTestDb();
    service = new MediaService(db, testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should remove references and delete orphaned media", async () => {
    const entries = [
      {
        filename: "test.jpg",
        index: "0",
        data: new Uint8Array([1, 2, 3, 4]),
      },
    ];
    const { mapping } = await service.importBatch("user-1", entries);
    const url = mapping.get("test.jpg")!;
    const filename = url.replace("/api/media/", "");

    const mediaRecord = db.select().from(media).all()[0];
    db.insert(noteMedia).values({ noteId: 1, mediaId: mediaRecord.id }).run();

    // Reconcile with empty array (simulating delete)
    service.reconcileNoteReferences(1, []);

    const refs = db.select().from(noteMedia).all();
    expect(refs).toHaveLength(0);

    const records = db.select().from(media).all();
    expect(records).toHaveLength(0);

    const filePath = join(testDir, filename);
    expect(existsSync(filePath)).toBe(false);
  });

  it("should not delete media still referenced by other notes", async () => {
    const entries = [
      {
        filename: "shared.png",
        index: "0",
        data: new Uint8Array([5, 6, 7]),
      },
    ];
    await service.importBatch("user-1", entries);
    const mediaRecord = db.select().from(media).all()[0];

    db.insert(noteMedia).values({ noteId: 1, mediaId: mediaRecord.id }).run();
    db.insert(noteMedia).values({ noteId: 2, mediaId: mediaRecord.id }).run();

    service.reconcileNoteReferences(1, []);

    const records = db.select().from(media).all();
    expect(records).toHaveLength(1);

    const refs = db.select().from(noteMedia).all();
    expect(refs).toHaveLength(1);
    expect(refs[0].noteId).toBe(2);
  });

  it("should add new references for newly added media", async () => {
    const entries = [
      {
        filename: "new.jpg",
        index: "0",
        data: new Uint8Array([8, 9, 10]),
      },
    ];
    await service.importBatch("user-1", entries);
    const mediaRecord = db.select().from(media).all()[0];

    service.reconcileNoteReferences(1, [mediaRecord.filename]);

    const refs = db.select().from(noteMedia).all();
    expect(refs).toHaveLength(1);
    expect(refs[0].noteId).toBe(1);
    expect(refs[0].mediaId).toBe(mediaRecord.id);
  });
});
