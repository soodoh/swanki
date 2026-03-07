import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { generateId } from "../id";
import { media } from "../../db/schema";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Db = BunSQLiteDatabase<typeof import("../../db/schema")>;

type MediaRecord = typeof media.$inferSelect;

const MEDIA_DIR = join(process.cwd(), "data", "media");

const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "video/"] as const;

function ensureMediaDir(): void {
  if (!existsSync(MEDIA_DIR)) {
    mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

export class MediaService {
  constructor(private db: Db) {}

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
    const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
    const filename = `${hash}${ext}`;

    // Write to disk
    const filePath = join(MEDIA_DIR, filename);
    await Bun.write(filePath, bytes);

    // Record in DB
    const id = generateId();
    const now = new Date();

    await this.db.insert(media).values({
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

    const filePath = join(MEDIA_DIR, record.filename);
    return { record, filePath };
  }
}
