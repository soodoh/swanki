import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../../test-utils";
import { MediaService } from "@/lib/services/media-service";
import { media } from "@/db/schema";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "@/db/schema";

type Db = BunSQLiteDatabase<typeof schema>;

const TEST_MEDIA_DIR = join(process.cwd(), "data", "media");

describe("MediaService.importBatch", () => {
  let db: Db;
  let service: MediaService;

  beforeEach(() => {
    db = createTestDb();
    service = new MediaService(db);
  });

  afterEach(() => {
    if (existsSync(TEST_MEDIA_DIR)) {
      rmSync(TEST_MEDIA_DIR, { recursive: true, force: true });
    }
  });

  it("should save media files and return filename mapping", async () => {
    const entries = [
      {
        filename: "image.jpg",
        index: "0",
        data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      },
      {
        filename: "sound.mp3",
        index: "1",
        data: new Uint8Array([0x49, 0x44, 0x33]),
      },
    ];

    const mapping = await service.importBatch("user-1", entries);

    expect(mapping.size).toBe(2);
    expect(mapping.get("image.jpg")).toMatch(/^\/api\/media\/[a-f0-9]+\.jpg$/);
    expect(mapping.get("sound.mp3")).toMatch(/^\/api\/media\/[a-f0-9]+\.mp3$/);

    const records = db.select().from(media).all();
    expect(records).toHaveLength(2);
  });

  it("should deduplicate identical files", async () => {
    const sameData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const entries = [
      { filename: "copy1.png", index: "0", data: sameData },
      { filename: "copy2.png", index: "1", data: sameData },
    ];

    const mapping = await service.importBatch("user-1", entries);

    expect(mapping.get("copy1.png")).toBe(mapping.get("copy2.png"));

    const records = db.select().from(media).all();
    expect(records).toHaveLength(1);
  });

  it("should skip entries with no data", async () => {
    const entries = [
      { filename: "missing.jpg", index: "0", data: new Uint8Array(0) },
    ];

    const mapping = await service.importBatch("user-1", entries);
    expect(mapping.size).toBe(0);
  });
});
