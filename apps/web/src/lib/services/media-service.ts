import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { generateId } from "../id";
import type * as schema from "../../db/schema";
import { media } from "../../db/schema";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Db = BunSQLiteDatabase<typeof schema>;

type MediaRecord = typeof media.$inferSelect;

// oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-member-access) -- node:path and process are untyped in this project
const MEDIA_DIR: string = join(process.cwd(), "data", "media");

const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "video/"] as const;

function ensureMediaDir(): void {
  // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
  if (!existsSync(MEDIA_DIR)) {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

export class MediaService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async upload(userId: string, file: File): Promise<MediaRecord> {
    ensureMediaDir();

    // Validate MIME type to prevent serving arbitrary content (e.g. text/html XSS)
    const mimeType = file.type || "application/octet-stream";
    const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
      mimeType.startsWith(prefix),
    );
    if (!isAllowed) {
      throw new Error(
        `Unsupported file type: ${mimeType}. Only image, audio, and video files are allowed.`,
      );
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Hash with SHA-256
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const hashArray = [...new Uint8Array(hashBuffer)];
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Check for duplicates by hash
    const existing = this.db
      .select()
      .from(media)
      .where(eq(media.hash, hash))
      .get();

    if (existing) {
      return existing;
    }

    // Generate a unique filename preserving the extension
    const ext: string = file.name.includes(".")
      ? `.${file.name.split(".").pop()}`
      : "";
    const filename = `${hash}${ext}`;

    // Write to disk
    // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call) -- node:path is untyped in this project
    const filePath: string = join(MEDIA_DIR, filename);
    // oxlint-disable-next-line typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-member-access) -- Bun global is untyped in this project
    await Bun.write(filePath, bytes);

    // Record in DB
    const id = generateId();
    const now = new Date();

    this.db.insert(media).values({
      id,
      userId,
      filename,
      hash,
      mimeType,
      size: bytes.length,
      createdAt: now,
    });

    const record = this.db.select().from(media).where(eq(media.id, id)).get();

    return record!;
  }

  getByFilename(
    filename: string,
  ): { record: MediaRecord; filePath: string } | undefined {
    const record = this.db
      .select()
      .from(media)
      .where(eq(media.filename, filename))
      .get();

    if (!record) {
      return undefined;
    }

    // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call) -- node:path is untyped in this project
    const filePath: string = join(MEDIA_DIR, record.filename);
    return { record, filePath };
  }
}
