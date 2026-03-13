import { eq, and } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "../../db/schema";
import { media, noteMedia } from "../../db/schema";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

type Db = BunSQLiteDatabase<typeof schema>;

type MediaRecord = typeof media.$inferSelect;

// oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-member-access) -- node:path and process are untyped in this project
const MEDIA_DIR: string = join(process.cwd(), "data", "media");

const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "video/"] as const;

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    avif: "image/avif",
    ico: "image/x-icon",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    opus: "audio/opus",
    mp4: "video/mp4",
    webm: "video/webm",
    "3gp": "video/3gpp",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}

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
    const now = new Date();

    const record = this.db
      .insert(media)
      .values({
        userId,
        filename,
        hash,
        mimeType,
        size: bytes.length,
        createdAt: now,
      })
      .returning()
      .get();
    return record;
  }

  async importBatch(
    userId: string,
    entries: Array<{ filename: string; index: string; data: Uint8Array }>,
  ): Promise<{ mapping: Map<string, string>; warnings: string[] }> {
    ensureMediaDir();

    const mapping = new Map<string, string>();
    const warnings: string[] = [];

    // Phase 1: Hash all files in parallel
    const nonEmpty = entries.filter((e) => {
      if (e.data.length === 0) {
        warnings.push(`Skipped empty file: ${e.filename}`);
        return false;
      }
      return true;
    });

    const hashes = await Promise.all(
      nonEmpty.map(async (entry) => {
        const buf = await crypto.subtle.digest("SHA-256", entry.data);
        return [...new Uint8Array(buf)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }),
    );

    // Phase 2: Deduplicate + check DB for existing (synchronous)
    type PendingWrite = {
      entry: (typeof nonEmpty)[number];
      hash: string;
      filename: string;
      mimeType: string;
      fileOnly?: boolean; // true when DB record exists but file is missing
    };
    const pendingWrites: PendingWrite[] = [];
    const seenHashes = new Map<string, string>(); // hash → filename (in-batch dedup)

    for (let i = 0; i < nonEmpty.length; i += 1) {
      const entry = nonEmpty[i];
      const hash = hashes[i];

      // In-batch dedup: if we've already seen this hash in the current batch
      const inBatchFilename = seenHashes.get(hash);
      if (inBatchFilename) {
        mapping.set(entry.filename, inBatchFilename);
        continue;
      }

      const existing = this.db
        .select()
        .from(media)
        .where(eq(media.hash, hash))
        .get();

      if (existing) {
        mapping.set(entry.filename, existing.filename);
        seenHashes.set(hash, existing.filename);
        // Re-write file if DB record exists but file is missing from disk
        // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call) -- node:path is untyped in this project
        const existingPath: string = join(MEDIA_DIR, existing.filename);
        // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
        if (!existsSync(existingPath)) {
          pendingWrites.push({
            entry,
            hash,
            filename: existing.filename,
            mimeType: existing.mimeType,
            fileOnly: true,
          });
        }
        continue;
      }

      const ext = entry.filename.includes(".")
        ? `.${entry.filename.split(".").pop()}`
        : "";
      const filename = `${hash}${ext}`;
      const mimeType = guessMimeType(entry.filename);
      seenHashes.set(hash, filename);

      // Skip files with unsupported MIME types (e.g. SVG can execute JS)
      const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
        mimeType.startsWith(prefix),
      );
      if (!isAllowed) {
        warnings.push(
          `Skipped unsupported file type: ${entry.filename} (${mimeType})`,
        );
        continue;
      }

      pendingWrites.push({ entry, hash, filename, mimeType });
    }

    // Phase 3: Write new files in parallel batches + insert DB records
    const BATCH_SIZE = 20;
    for (let i = 0; i < pendingWrites.length; i += BATCH_SIZE) {
      const batch = pendingWrites.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async ({ entry, filename }) => {
          // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call) -- node:path is untyped in this project
          const filePath: string = join(MEDIA_DIR, filename);
          // oxlint-disable-next-line typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-member-access) -- Bun global is untyped in this project
          await Bun.write(filePath, entry.data);
        }),
      );

      for (const { entry, hash, filename, mimeType, fileOnly } of batch) {
        if (!fileOnly) {
          this.db
            .insert(media)
            .values({
              userId,
              filename,
              hash,
              mimeType,
              size: entry.data.length,
              createdAt: new Date(),
            })
            .run();

          mapping.set(entry.filename, filename);
        }
      }
    }

    return { mapping, warnings, mediaCount: mapping.size };
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

  reconcileNoteReferences(noteId: number, currentFilenames: string[]): void {
    const existingRefs = this.db
      .select()
      .from(noteMedia)
      .where(eq(noteMedia.noteId, noteId))
      .all();

    const existingMediaIds = new Set(existingRefs.map((r) => r.mediaId));

    const currentMediaIds = new Set<number>();
    for (const filename of currentFilenames) {
      const record = this.db
        .select()
        .from(media)
        .where(eq(media.filename, filename))
        .get();
      if (record) {
        currentMediaIds.add(record.id);
      }
    }

    // Add new references
    for (const mediaId of currentMediaIds) {
      if (!existingMediaIds.has(mediaId)) {
        this.db
          .insert(noteMedia)
          .values({ noteId, mediaId })
          .onConflictDoNothing()
          .run();
      }
    }

    // Remove stale references and clean up orphans
    for (const ref of existingRefs) {
      if (!currentMediaIds.has(ref.mediaId)) {
        this.db
          .delete(noteMedia)
          .where(
            and(
              eq(noteMedia.noteId, noteId),
              eq(noteMedia.mediaId, ref.mediaId),
            ),
          )
          .run();

        // Check if media is now orphaned
        const remaining = this.db
          .select()
          .from(noteMedia)
          .where(eq(noteMedia.mediaId, ref.mediaId))
          .all();

        if (remaining.length === 0) {
          const mediaRecord = this.db
            .select()
            .from(media)
            .where(eq(media.id, ref.mediaId))
            .get();

          if (mediaRecord) {
            // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call) -- node:path is untyped in this project
            const filePath: string = join(MEDIA_DIR, mediaRecord.filename);
            try {
              // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
              unlinkSync(filePath);
            } catch {
              // File may already be gone
            }
            this.db.delete(media).where(eq(media.id, ref.mediaId)).run();
          }
        }
      }
    }
  }
}
